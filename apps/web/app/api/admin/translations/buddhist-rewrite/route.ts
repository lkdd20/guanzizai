import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

import { hasAdminAccess } from '@/lib/admin-auth'
import {
  buddhistTranslationPromptVersion,
  generateBuddhistTranslationDraft,
  type BuddhistTranslationSourceSegment,
} from '@/lib/buddhist-translation-generator'
import {
  inspectGeneratedBuddhistTranslation,
  isBuddhistMantraText,
  isBuddhistNameEnumeration,
  isBuddhistStructuralHeading,
} from '@/lib/buddhist-translation-quality'
import { contentSql } from '@/lib/content-db'
import { translationContentHash } from '@/lib/translation-quality'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
const supportedWorks = new Set([
  'bcc-ws-amituo',
  'bcc-ws-jingang',
  'bcc-ws-dizang',
  'bcc-ws-fahua',
  'bcc-ws-dazhidu',
])

async function hasRewriteAccess(request: Request) {
  if (await hasAdminAccess()) return true
  const expected = process.env.BUDDHIST_REWRITE_JOB_TOKEN?.trim() ?? ''
  const provided = request.headers.get('x-rewrite-token')?.trim() ?? ''
  if (!expected || !provided) return false
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

function sourceSegments(value: unknown, original: string): BuddhistTranslationSourceSegment[] {
  if (!Array.isArray(value) || !value.length) return [{ index: 1, source: original }]
  const segments = value.map((segment) => {
    const item = segment as Record<string, unknown>
    return { index: Number(item.index), source: String(item.source ?? '').trim() }
  }).filter((segment) => Number.isInteger(segment.index) && segment.source)
  return segments.length ? segments : [{ index: 1, source: original }]
}

export async function POST(request: Request) {
  if (!(await hasRewriteAccess(request))) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const body = await request.json().catch(() => null) as {
    workId?: string
    limit?: number
    concurrency?: number
    retryFailed?: boolean
    retryBlocked?: boolean
    retryRunId?: string
  } | null
  const workId = body?.workId?.trim() ?? ''
  const limit = Math.max(1, Math.min(10, Math.trunc(body?.limit ?? 5)))
  const concurrency = Math.max(1, Math.min(2, Math.trunc(body?.concurrency ?? 1)))
  const retryRunId = body?.retryRunId?.trim() ?? ''
  const retryRequested = body?.retryFailed === true || body?.retryBlocked === true
  if (body?.retryFailed === true && body?.retryBlocked === true) {
    return NextResponse.json({ error: 'conflicting_retry_modes' }, { status: 400, headers })
  }
  if (retryRequested && !/^[0-9a-f-]{36}$/iu.test(retryRunId)) {
    return NextResponse.json({ error: 'invalid_retry_run_id' }, { status: 400, headers })
  }
  if (!supportedWorks.has(workId)) return NextResponse.json({ error: 'unsupported_work' }, { status: 400, headers })
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers })
  const database = db

  const terms = await database`
    SELECT gt.term_simplified
    FROM work_term_definitions wd JOIN glossary_terms gt ON gt.id=wd.term_id
    WHERE wd.work_id=${workId}
    ORDER BY gt.term_simplified
  `
  const candidates = await database`
    SELECT t.id AS translation_id, p.id AS passage_id, p.sequence, p.original_text, p.content_hash,
      w.title AS work_title, COALESCE(s.title, '正文') AS section_title,
      (SELECT previous.original_text FROM passages previous
        WHERE previous.work_id=p.work_id AND previous.sequence<p.sequence
        ORDER BY previous.sequence DESC LIMIT 1) AS previous_text,
      (SELECT following.original_text FROM passages following
        WHERE following.work_id=p.work_id AND following.sequence>p.sequence
        ORDER BY following.sequence LIMIT 1) AS next_text,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('index', d.segment_index, 'source', d.source_text) ORDER BY d.segment_index)
        FROM translation_draft_segments d
        WHERE d.passage_id=p.id AND d.source_snapshot_hash=p.content_hash
      ), '[]'::jsonb) AS source_segments
    FROM translations t
    JOIN passages p ON p.id=t.passage_id
    JOIN works w ON w.id=p.work_id
    LEFT JOIN work_sections s ON s.id=p.section_id
    WHERE p.work_id=${workId}
      AND w.publication_status='published'
      AND t.language='zh-Hans'
      AND t.origin='ai'
      AND t.status='draft'
      AND t.source_content_hash=p.content_hash
      AND t.quality_report->'automatedRiskAudit'->>'action' IN ('withdrawn_to_draft', 'rewrite_still_blocked')
      AND (
        t.prompt_version IS DISTINCT FROM ${buddhistTranslationPromptVersion}
        OR (${body?.retryFailed === true} AND t.quality_report->'rewriteAttempt'->>'status'='failed'
          AND t.quality_report->'rewriteAttempt'->>'retryRunId' IS DISTINCT FROM ${retryRunId})
        OR (${body?.retryBlocked === true} AND t.quality_report->'rewriteAttempt'->>'status'='blocked'
          AND t.quality_report->'rewriteAttempt'->>'retryRunId' IS DISTINCT FROM ${retryRunId})
      )
    ORDER BY p.sequence
    LIMIT ${limit}
  `

  const results: Array<{ passageId: string; status: 'published' | 'blocked' | 'failed'; issues?: string[]; error?: string }> = []
  let cursor = 0
  async function worker() {
    while (cursor < candidates.length) {
      const passage = candidates[cursor++]
      const passageId = String(passage.passage_id)
      try {
        const sources = sourceSegments(passage.source_segments, String(passage.original_text))
        const generated = await generateBuddhistTranslationDraft({
          workTitle: String(passage.work_title),
          sectionTitle: String(passage.section_title || '正文'),
          previousText: passage.previous_text ? String(passage.previous_text) : null,
          nextText: passage.next_text ? String(passage.next_text) : null,
          terms: terms.map((term) => String(term.term_simplified)),
          segments: sources,
        })
        const originalText = String(passage.original_text)
        const passagePreservesMantra = isBuddhistMantraText(originalText)
        const segmentReports = generated.segments.map((segment, index) => {
          const source = sources[index].source
          const preserveMantra = passagePreservesMantra || isBuddhistMantraText(source)
          return inspectGeneratedBuddhistTranslation(source, segment.translation, {
            allowUnchangedSource: isBuddhistStructuralHeading(source) || preserveMantra,
            allowSourceCopy: preserveMantra || isBuddhistNameEnumeration(source),
          })
        })
        const content = generated.segments.map((segment) => segment.translation.trim()).join('\n\n')
        const aggregateReport = inspectGeneratedBuddhistTranslation(originalText, content, {
          allowUnchangedSource: passagePreservesMantra,
          allowSourceCopy: passagePreservesMantra || isBuddhistNameEnumeration(originalText),
        })
        const issues = [...new Set([...segmentReports, aggregateReport].flatMap((report) => report.issues.map((issue) => issue.code)))]
        const publish = issues.length === 0
        await database.begin(async (transaction) => {
          for (let index = 0; index < generated.segments.length; index += 1) {
            const segment = generated.segments[index]
            const source = sources[index]
            await transaction`
              INSERT INTO translation_draft_segments (
                passage_id,segment_index,source_text,translation_text,method,model,quality_flags,
                human_reviewed,source_snapshot_hash,imported_at
              ) VALUES (
                ${passageId},${segment.index},${source.source},${segment.translation},'buddhist_close_plain',${generated.model},
                ${transaction.json(segmentReports[index].issues.map((issue) => issue.code))},false,${passage.content_hash},now()
              )
              ON CONFLICT (passage_id,segment_index) DO UPDATE SET
                source_text=EXCLUDED.source_text,translation_text=EXCLUDED.translation_text,
                method=EXCLUDED.method,model=EXCLUDED.model,quality_flags=EXCLUDED.quality_flags,
                human_reviewed=false,source_snapshot_hash=EXCLUDED.source_snapshot_hash,imported_at=now()
            `
          }
          await transaction`
            UPDATE translations SET
              content=${content},content_hash=${translationContentHash(content)},source_content_hash=${passage.content_hash},
              model=${generated.model},prompt_version=${buddhistTranslationPromptVersion},origin='ai',
              source_name='观自在佛典近义白话 v2',
              license_note='项目原创 AI 近义白话；未真人审核，仅作辅助阅读。',
              quality_report=COALESCE(quality_report,'{}'::jsonb) || ${transaction.json({
                humanReviewed: false,
                rewriteAttempt: {
                  status: publish ? 'published' : 'blocked',
                  promptVersion: buddhistTranslationPromptVersion,
                  ...(retryRunId ? { retryRunId } : {}),
                  issues,
                  generatedAt: new Date().toISOString(),
                },
                automatedRiskAudit: {
                  version: 'buddhist-generated-translation-gate-v2.1',
                  riskLevel: publish ? 'clear' : 'high',
                  action: publish ? 'rewritten_and_republished' : 'rewrite_still_blocked',
                  humanReviewed: false,
                },
              })}::jsonb,
              status=${publish ? 'published' : 'draft'},reviewer=NULL,
              published_at=${publish ? new Date() : null}
            WHERE id=${passage.translation_id}
          `
        })
        results.push({ passageId, status: publish ? 'published' : 'blocked', issues })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await database`
          UPDATE translations SET prompt_version=${buddhistTranslationPromptVersion},
            quality_report=COALESCE(quality_report,'{}'::jsonb) || ${database.json({
              humanReviewed: false,
              rewriteAttempt: {
                status: 'failed',
                promptVersion: buddhistTranslationPromptVersion,
                ...(retryRunId ? { retryRunId } : {}),
                error: message.slice(0, 300),
                generatedAt: new Date().toISOString(),
              },
            })}::jsonb
          WHERE id=${passage.translation_id}
        `
        results.push({ passageId, status: 'failed', error: message })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()))

  const [remaining] = await database`
    SELECT count(*)::integer AS count
    FROM translations t JOIN passages p ON p.id=t.passage_id
    WHERE p.work_id=${workId} AND t.language='zh-Hans' AND t.origin='ai' AND t.status='draft'
      AND t.quality_report->'automatedRiskAudit'->>'action' IN ('withdrawn_to_draft', 'rewrite_still_blocked')
      AND (
        t.prompt_version IS DISTINCT FROM ${buddhistTranslationPromptVersion}
        OR (${body?.retryFailed === true} AND t.quality_report->'rewriteAttempt'->>'status'='failed'
          AND t.quality_report->'rewriteAttempt'->>'retryRunId' IS DISTINCT FROM ${retryRunId})
        OR (${body?.retryBlocked === true} AND t.quality_report->'rewriteAttempt'->>'status'='blocked'
          AND t.quality_report->'rewriteAttempt'->>'retryRunId' IS DISTINCT FROM ${retryRunId})
      )
  `
  return NextResponse.json({
    workId,
    requested: candidates.length,
    published: results.filter((result) => result.status === 'published').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    failed: results.filter((result) => result.status === 'failed').length,
    remaining: Number(remaining?.count ?? 0),
    results,
  }, { headers })
}
