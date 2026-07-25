import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { getAuthSession } from '@/lib/auth'
import { attachmentMetadataError, safeAttachmentFileName } from '@/lib/community-attachments'
import { createPrivateUploadUrl } from '@/lib/content-object-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!(await getAuthSession())) return NextResponse.json({ error: 'file_login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as { name?: string; type?: string; size?: number; sha256?: string } | null
  if (!body?.name || !Number.isSafeInteger(body.size) || !body.sha256) return NextResponse.json({ error: 'attachment_invalid' }, { status: 400 })
  const id = randomUUID()
  const name = safeAttachmentFileName(body.name)
  const candidate = { id, name, key: `community-contributions/${id}/${name}`, type: body.type || 'application/octet-stream', size: body.size, sha256: body.sha256 }
  const metadataError = attachmentMetadataError(candidate)
  if (metadataError) return NextResponse.json({ error: metadataError }, { status: 400 })
  try {
    const uploadUrl = await createPrivateUploadUrl(candidate.key, candidate.type, candidate.sha256)
    return NextResponse.json({ ok: true, id, key: candidate.key, uploadUrl, expiresIn: 600 }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('community attachment signing failed', error)
    return NextResponse.json({ error: 'attachment_storage_unavailable' }, { status: 503 })
  }
}
