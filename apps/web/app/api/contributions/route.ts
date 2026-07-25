import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'

import { getAuthSession } from '@/lib/auth'
import { contentSql } from '@/lib/content-db'
import { attachmentError, attachmentMetadataError, safeAttachmentFileName, type AttachmentMetadata } from '@/lib/community-attachments'
import { isCommunityContributionKind, shouldPubliclyCredit } from '@/lib/community-contributions'
import { deletePrivateObject, headPrivateObject, putPrivateObject } from '@/lib/content-object-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function email(value: unknown) {
  const normalized = clean(value, 180).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

function optionalUrl(value: unknown) {
  const raw = clean(value, 1000)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  let body: Record<string, unknown> | null = null
  let attachment: File | null = null
  let attachmentMeta: AttachmentMetadata | null = null
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    body = Object.fromEntries(form.entries())
    const candidate = form.get('attachment')
    attachment = candidate instanceof File && candidate.size > 0 ? candidate : null
  } else {
    body = await request.json().catch(() => null) as Record<string, unknown> | null
    const candidate = body?.attachment
    if (candidate) {
      const metadataError = attachmentMetadataError(candidate)
      if (metadataError) return NextResponse.json({ error: metadataError }, { status: 400 })
      attachmentMeta = candidate as AttachmentMetadata
    }
  }
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const session = await getAuthSession()
  if ((attachment || attachmentMeta) && !session) return NextResponse.json({ error: 'file_login_required' }, { status: 401 })
  const fileError = attachmentError(attachment)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })
  const kind = clean(body.kind, 40)
  const contributorEmail = session?.user.email ?? email(body.email)
  const contributorName = clean(body.contributorName, 80) || session?.user.name || ''
  const workTitle = clean(body.workTitle, 180)
  const title = clean(body.title, 180)
  const description = clean(body.description, 6000)
  const licenseNote = clean(body.licenseNote, 2000)
  const rawUrl = clean(body.sourceUrl, 1000)
  const sourceUrl = optionalUrl(rawUrl)
  if (!isCommunityContributionKind(kind) || !contributorEmail || !contributorName || !workTitle || !title || description.length < 20 || licenseNote.length < 8) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (rawUrl && !sourceUrl) return NextResponse.json({ error: 'invalid_source_url' }, { status: 400 })
  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  const [rate] = await db`
    SELECT count(*)::integer AS count FROM community_contributions
    WHERE contributor_email = ${contributorEmail} AND submitted_at > now() - interval '1 hour'
  `
  if (Number(rate?.count ?? 0) >= 8) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const id = randomUUID()
  let attachmentKey: string | null = null
  try {
    let attachmentHash: string | null = null
    let attachmentName: string | null = null
    let attachmentContentType: string | null = null
    let attachmentSize: number | null = null
    if (attachment) {
      const bytes = new Uint8Array(await attachment.arrayBuffer())
      attachmentHash = createHash('sha256').update(bytes).digest('hex')
      attachmentName = safeAttachmentFileName(attachment.name)
      attachmentContentType = attachment.type || 'application/octet-stream'
      attachmentSize = attachment.size
      attachmentKey = `community-contributions/${id}/${attachmentName}`
      await putPrivateObject(attachmentKey, bytes, attachmentContentType)
    } else if (attachmentMeta) {
      const stored = await headPrivateObject(attachmentMeta.key)
      if (!stored || Number(stored.ContentLength ?? -1) !== attachmentMeta.size || stored.Metadata?.sha256 !== attachmentMeta.sha256.toLowerCase()) {
        return NextResponse.json({ error: 'attachment_integrity_failed' }, { status: 400 })
      }
      attachmentKey = attachmentMeta.key
      attachmentName = attachmentMeta.name
      attachmentContentType = attachmentMeta.type || stored.ContentType || 'application/octet-stream'
      attachmentSize = attachmentMeta.size
      attachmentHash = attachmentMeta.sha256.toLowerCase()
    }
    const [result] = await db`
      INSERT INTO community_contributions (
        id, kind, work_title, contributor_user_id, contributor_provider, contributor_email,
        contributor_name, organization_name, title, description, source_name, source_url,
        license_note, public_credit, attachment_key, attachment_name, attachment_content_type,
        attachment_bytes, attachment_sha256, attachment_status, attachment_uploaded_at
      ) VALUES (
        ${id}, ${kind}, ${workTitle}, ${session?.user.id ?? null}, ${session?.user.provider ?? null}, ${contributorEmail},
        ${contributorName}, ${clean(body.organizationName, 180) || null}, ${title}, ${description},
        ${clean(body.sourceName, 240) || null}, ${sourceUrl}, ${licenseNote}, ${shouldPubliclyCredit(kind, body.publicCredit)},
        ${attachmentKey}, ${attachmentName}, ${attachmentContentType},
        ${attachmentSize}, ${attachmentHash}, ${attachmentKey ? 'uploaded' : 'none'}, ${attachmentKey ? new Date() : null}
      ) RETURNING id
    `
    return NextResponse.json({ ok: true, id: String(result.id), attachment: Boolean(attachmentKey) }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (attachmentKey) await deletePrivateObject(attachmentKey).catch(() => undefined)
    console.error('community contribution failed', error)
    const message = error instanceof Error && error.message.includes('R2 storage is not configured')
      ? 'attachment_storage_unavailable'
      : 'service_unavailable'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
