import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { contentSql } from '@/lib/content-db'
import {
  generateTranslationDraft,
  translationPromptVersion,
} from '@/lib/translation-generator'
import { inspectTranslation, translationContentHash } from '@/lib/translation-quality'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
const supportedWorks = new Set(['dzg-d0a3dfbdc761123d'])

async function ensureTranslationPipeline(db: NonNullable<ReturnType<typeof contentSql>>) {
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'ai'`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS source_name text`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS source_url text`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS license_note text`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS quality_report jsonb NOT NULL DEFAULT '{}'::jsonb`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS contributor_name text`
  await db`ALTER TABLE translations ADD COLUMN IF NOT EXISTS contribution_id uuid`
  await db`
    CREATE TABLE IF NOT EXISTS translation_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      language text NOT NULL DEFAULT 'zh-Hans',
      origin text NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai', 'licensed', 'manual')),
      model text,
      prompt_version text,
      status import_job_status NOT NULL DEFAULT 'running',
      requested_count integer NOT NULL DEFAULT 0,
      completed_count integer NOT NULL DEFAULT 0,
      failed_count integer NOT NULL DEFAULT 0,
      error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    )
  `
  await db`
    CREATE TABLE IF NOT EXISTS translation_contributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
      contributor_user_id text NOT NULL,
      contributor_provider text NOT NULL,
      contributor_email text NOT NULL,
      contributor_name text NOT NULL,
      translation_text text NOT NULL,
      translation_hash char(64) NOT NULL,
      source_content_hash char(64) NOT NULL,
      source_type text NOT NULL CHECK (source_type IN ('original', 'licensed', 'other')),
      source_name text,
      source_url text,
      license_note text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'needs_changes', 'approved', 'rejected')),
      reviewer text,
      review_note text,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz
    )
  `
  await db`CREATE INDEX IF NOT EXISTS translation_jobs_work_idx ON translation_jobs (work_id, started_at DESC)`
  await db`CREATE INDEX IF NOT EXISTS translation_contributions_status_idx ON translation_contributions (status, submitted_at)`
  await db`CREATE INDEX IF NOT EXISTS translation_contributions_user_idx ON translation_contributions (contributor_user_id, submitted_at DESC)`
}

export async function GET() {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers })

  const works = await db`
    SELECT w.id, w.title, w.source_verification, w.publication_status, w.passage_count,
      COUNT(t.id) FILTER (WHERE t.status = 'draft')::int AS draft_count,
      COUNT(t.id) FILTER (WHERE t.status = 'reviewed')::int AS reviewed_count,
      COUNT(t.id) FILTER (WHERE t.status = 'published')::int AS published_count
    FROM works w
    LEFT JOIN passages p ON p.work_id = w.id
    LEFT JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans'
    WHERE w.id = 'dzg-d0a3dfbdc761123d'
    GROUP BY w.id, w.title, w.source_verification, w.publication_status, w.passage_count
    ORDER BY w.title
  `
  const translations = await db`
    SELECT t.id, t.status, t.content, t.quality_report, t.model, t.prompt_version,
      p.id AS passage_id, p.sequence, p.original_text, p.content_hash AS source_content_hash,
      w.id AS work_id, w.title AS work_title, w.source_verification,
      COALESCE(s.title, '正文') AS section_title
    FROM translations t
    JOIN passages p ON p.id = t.passage_id
    JOIN works w ON w.id = p.work_id
    LEFT JOIN work_sections s ON s.id = p.section_id
    WHERE w.id = 'dzg-d0a3dfbdc761123d'
      AND t.language = 'zh-Hans' AND t.status IN ('draft', 'reviewed', 'published')
    ORDER BY CASE WHEN t.status = 'reviewed' THEN 0 ELSE 1 END, w.title, p.sequence
    LIMIT 40
  `
  return NextResponse.json({ works, translations }, { headers })
}

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const body = await request.json().catch(() => null) as { workId?: string; limit?: number } | null
  const workId = body?.workId?.trim() ?? ''
  const limit = Math.max(1, Math.min(5, Math.trunc(body?.limit ?? 1)))
  if (!supportedWorks.has(workId)) return NextResponse.json({ error: 'unsupported_work' }, { status: 400, headers })
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers })
  const database = db
  await ensureTranslationPipeline(db)

  const passages = await db`
    SELECT p.id, p.sequence, p.original_text, p.content_hash, w.title AS work_title,
      COALESCE(s.title, '正文') AS section_title,
      (SELECT previous.original_text FROM passages previous
        WHERE previous.work_id = p.work_id AND previous.sequence < p.sequence
        ORDER BY previous.sequence DESC LIMIT 1) AS previous_text,
      (SELECT following.original_text FROM passages following
        WHERE following.work_id = p.work_id AND following.sequence > p.sequence
        ORDER BY following.sequence LIMIT 1) AS next_text
    FROM passages p
    JOIN works w ON w.id = p.work_id
    LEFT JOIN work_sections s ON s.id = p.section_id
    LEFT JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans'
    WHERE p.work_id = ${workId} AND w.publication_status = 'published'
      AND p.sequence >= GREATEST(w.reading_start_sequence, 1)
      AND p.character_count >= 12
      AND (t.id IS NULL OR t.source_content_hash <> p.content_hash)
    ORDER BY p.sequence
    LIMIT ${limit}
  `
  const [job] = await db`
    INSERT INTO translation_jobs (work_id, model, prompt_version, requested_count)
    VALUES (${workId}, ${process.env.NEWAPI_MODEL?.trim() || 'unconfigured-model'}, ${translationPromptVersion}, ${passages.length})
    RETURNING id
  `
  const errors: Array<{ passageId: string; error: string }> = []
  let completed = 0
  let cursor = 0
  async function worker() {
    while (cursor < passages.length) {
      const passage = passages[cursor++]
      try {
        const draft = await generateTranslationDraft({
          workTitle: String(passage.work_title),
          sectionTitle: passage.section_title ? String(passage.section_title) : null,
          previousText: passage.previous_text ? String(passage.previous_text) : null,
          originalText: String(passage.original_text),
          nextText: passage.next_text ? String(passage.next_text) : null,
        })
        await database`
          INSERT INTO translations (
            passage_id, language, content, content_hash, source_content_hash, model,
            prompt_version, origin, quality_report, status
          ) VALUES (
            ${passage.id}, 'zh-Hans', ${draft.content}, ${translationContentHash(draft.content)}, ${passage.content_hash},
            ${draft.model}, ${translationPromptVersion}, 'ai', ${database.json({
              passed: draft.qualityReport.passed,
              issues: draft.qualityReport.issues,
              lengthRatio: draft.qualityReport.lengthRatio,
            })}, 'draft'
          )
          ON CONFLICT (passage_id, language) DO UPDATE SET
            content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
            source_content_hash = EXCLUDED.source_content_hash, model = EXCLUDED.model,
            prompt_version = EXCLUDED.prompt_version, origin = 'ai',
            quality_report = EXCLUDED.quality_report, status = 'draft', reviewer = NULL, published_at = NULL
        `
        completed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('translation_draft_failed', { passageId: String(passage.id), error: message })
        errors.push({ passageId: String(passage.id), error: message })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, passages.length) }, () => worker()))
  await db`
    UPDATE translation_jobs SET status = ${errors.length ? 'failed' : 'completed'},
      completed_count = ${completed}, failed_count = ${errors.length},
      error_summary = ${db.json(errors)}, completed_at = now()
    WHERE id = ${job.id}
  `
  return NextResponse.json({ jobId: job.id, requested: passages.length, completed, errors }, { headers })
}

export async function PATCH(request: Request) {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const body = await request.json().catch(() => null) as {
    id?: number
    content?: string
    action?: 'review' | 'publish'
    reviewer?: string
  } | null
  const content = body?.content?.trim() ?? ''
  if (!body?.id || !content || !['review', 'publish'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  }
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers })
  const [translation] = await db`
    SELECT t.id, t.status, t.source_content_hash, p.content_hash AS current_source_hash, p.original_text,
      w.source_verification
    FROM translations t
    JOIN passages p ON p.id = t.passage_id
    JOIN works w ON w.id = p.work_id
    WHERE t.id = ${body.id} AND t.language = 'zh-Hans' AND t.status IN ('draft', 'reviewed', 'published')
    LIMIT 1
  `
  if (!translation) return NextResponse.json({ error: 'translation_not_found' }, { status: 404, headers })
  if (String(translation.source_content_hash) !== String(translation.current_source_hash)) {
    return NextResponse.json({ error: 'source_changed' }, { status: 409, headers })
  }
  if (body.action === 'publish' && !['reviewed', 'published'].includes(String(translation.status))) {
    return NextResponse.json({ error: 'translation_not_reviewed' }, { status: 409, headers })
  }
  const status = body.action === 'publish' ? 'published' : 'reviewed'
  const report = inspectTranslation(String(translation.original_text), content)
  await db`
    UPDATE translations SET content = ${content}, content_hash = ${translationContentHash(content)},
      quality_report = ${db.json({ passed: report.passed, issues: report.issues, lengthRatio: report.lengthRatio })},
      status = ${status},
      reviewer = ${body.reviewer?.trim().slice(0, 80) || '观自在精校'},
      published_at = ${body.action === 'publish' ? new Date() : null}
    WHERE id = ${body.id}
  `
  return NextResponse.json({ ok: true, status, qualityReport: report }, { headers })
}
