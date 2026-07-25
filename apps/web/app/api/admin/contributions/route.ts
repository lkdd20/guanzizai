import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { adminContentSql } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminContentSql()
  if (!db) return NextResponse.json({ contributions: [] })
  const contributions = await db`
    SELECT id, kind, work_title, contributor_name, organization_name, contributor_email,
      title, description, source_name, source_url, license_note, public_credit, status, submitted_at,
      attachment_name, attachment_content_type, attachment_bytes, attachment_sha256, attachment_status,
      attachment_uploaded_at
    FROM community_contributions
    ORDER BY CASE WHEN status = 'pending' THEN 0 WHEN status = 'reviewing' THEN 1 ELSE 2 END, submitted_at DESC
    LIMIT 100
  `
  return NextResponse.json({ contributions }, { headers: { 'cache-control': 'no-store' } })
}

export async function PATCH(request: Request) {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { id?: string; status?: string; note?: string } | null
  const statuses = ['reviewing', 'needs_changes', 'accepted', 'rejected']
  if (!body?.id || !statuses.includes(body.status ?? '')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const db = adminContentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  await db`UPDATE community_contributions SET status = ${body.status!}, review_note = ${body.note?.trim().slice(0, 1000) || null}, reviewer = '观自在审核', reviewed_at = now() WHERE id = ${body.id}`
  return NextResponse.json({ ok: true })
}
