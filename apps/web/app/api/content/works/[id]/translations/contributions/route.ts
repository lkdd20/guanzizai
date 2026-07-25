import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

import { getAuthSession } from '@/lib/auth'
import { contentSql } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const passageId = clean(body?.passageId, 180)
  const translation = clean(body?.translation, 12000)
  const contributorName = clean(body?.contributorName, 80) || session.user.name
  const sourceType = clean(body?.sourceType, 24)
  const sourceName = clean(body?.sourceName, 180)
  const sourceUrl = clean(body?.sourceUrl, 500)
  const licenseNote = clean(body?.licenseNote, 1000)
  if (!passageId || translation.length < 4 || !['original', 'licensed', 'other'].includes(sourceType)) {
    return NextResponse.json({ error: 'invalid_submission' }, { status: 400 })
  }
  if (!licenseNote || (sourceType !== 'original' && !sourceName)) {
    return NextResponse.json({ error: 'source_details_required' }, { status: 400 })
  }
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid')
    } catch {
      return NextResponse.json({ error: 'invalid_source_url' }, { status: 400 })
    }
  }
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  const [passage] = await db`
    SELECT p.content_hash
    FROM passages p JOIN works w ON w.id = p.work_id
    WHERE p.id = ${passageId} AND p.work_id = ${id} AND w.publication_status = 'published'
    LIMIT 1
  `
  if (!passage) return NextResponse.json({ error: 'passage_not_found' }, { status: 404 })
  const [recent] = await db`
    SELECT count(*)::integer AS count FROM translation_contributions
    WHERE contributor_user_id = ${session.user.id} AND submitted_at > now() - interval '1 hour'
  `
  if (Number(recent.count) >= 20) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const [submission] = await db`
    INSERT INTO translation_contributions (
      work_id, passage_id, contributor_user_id, contributor_provider, contributor_email,
      contributor_name, translation_text, translation_hash, source_content_hash,
      source_type, source_name, source_url, license_note
    ) VALUES (
      ${id}, ${passageId}, ${session.user.id}, ${session.user.provider}, ${session.user.email},
      ${contributorName}, ${translation}, ${sha256(translation)}, ${String(passage.content_hash)},
      ${sourceType}, ${sourceName || null}, ${sourceUrl || null}, ${licenseNote}
    ) RETURNING id, status, submitted_at
  `
  return NextResponse.json({ submission }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
