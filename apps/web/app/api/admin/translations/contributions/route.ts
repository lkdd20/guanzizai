import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { contentSql } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = contentSql()
  if (!db) return NextResponse.json({ contributions: [] }, { headers: { 'cache-control': 'no-store' } })
  const contributions = await db`
    SELECT c.id, c.work_id, w.title AS work_title, c.passage_id, p.sequence,
           p.original_text, c.translation_text, c.contributor_name, c.source_type,
           c.source_name, c.source_url, c.license_note, c.status, c.submitted_at
    FROM translation_contributions c
    JOIN works w ON w.id = c.work_id
    JOIN passages p ON p.id = c.passage_id
    ORDER BY CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END, c.submitted_at DESC
    LIMIT 100
  `
  return NextResponse.json({ contributions }, { headers: { 'cache-control': 'no-store' } })
}

export async function PATCH(request: Request) {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { id?: string; action?: string; reviewer?: string; note?: string } | null
  if (!body?.id || !['approve', 'needs_changes', 'reject'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  const reviewer = body.reviewer?.trim().slice(0, 80) || '观自在审核'
  const note = body.note?.trim().slice(0, 1000) || null
  const contributionId = String(body.id)
  const action = String(body.action)
  if (body.action === 'approve') {
    await db.begin(async (tx) => {
      const [contribution] = await tx`
        SELECT c.*, p.content_hash AS current_source_hash
        FROM translation_contributions c JOIN passages p ON p.id = c.passage_id
        WHERE c.id = ${contributionId} AND c.status IN ('pending', 'needs_changes') FOR UPDATE
      `
      if (!contribution) throw new Error('submission_not_found')
      if (String(contribution.source_content_hash) !== String(contribution.current_source_hash)) throw new Error('source_changed')
      await tx`
        UPDATE translation_contributions SET status = 'approved', reviewer = ${reviewer},
          review_note = ${note}, reviewed_at = now() WHERE id = ${contributionId}
      `
      await tx`
        INSERT INTO translations (
          passage_id, language, content, content_hash, source_content_hash, origin,
          source_name, source_url, license_note, contributor_name, contribution_id,
          status, reviewer, published_at
        ) VALUES (
          ${contribution.passage_id}, 'zh-Hans', ${contribution.translation_text}, ${contribution.translation_hash},
          ${contribution.source_content_hash},
          ${contribution.source_type === 'licensed' ? 'licensed' : 'manual'}, ${contribution.source_name},
          ${contribution.source_url}, ${contribution.license_note}, ${contribution.contributor_name},
          ${contribution.id}, 'published', ${reviewer}, now()
        )
        ON CONFLICT (passage_id, language) DO UPDATE SET
          content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
          source_content_hash = EXCLUDED.source_content_hash, origin = EXCLUDED.origin,
          source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url,
          license_note = EXCLUDED.license_note, contributor_name = EXCLUDED.contributor_name,
          contribution_id = EXCLUDED.contribution_id, status = 'published',
          reviewer = EXCLUDED.reviewer, published_at = now()
      `
    })
  } else {
    await db`
      UPDATE translation_contributions SET
        status = ${action === 'reject' ? 'rejected' : 'needs_changes'},
        reviewer = ${reviewer}, review_note = ${note}, reviewed_at = now()
      WHERE id = ${contributionId} AND status IN ('pending', 'needs_changes')
    `
  }
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
