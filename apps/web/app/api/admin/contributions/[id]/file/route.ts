import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { adminContentSql } from '@/lib/content-db'
import { readPrivateObject } from '@/lib/content-object-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const db = adminContentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  const [item] = await db`
    SELECT attachment_key, attachment_name, attachment_content_type
    FROM community_contributions
    WHERE id = ${id} AND attachment_status = 'uploaded' AND attachment_key IS NOT NULL
    LIMIT 1
  `
  if (!item) return NextResponse.json({ error: 'attachment_not_found' }, { status: 404 })
  const body = await readPrivateObject(String(item.attachment_key))
  if (!body) return NextResponse.json({ error: 'attachment_unavailable' }, { status: 404 })
  const fileName = String(item.attachment_name || 'attachment').replace(/["\r\n]/g, '_')
  const asciiFileName = fileName.replace(/[^\x20-\x7e]/g, '_') || 'attachment'
  return new NextResponse(body as BodyInit, {
    headers: {
      'Content-Type': String(item.attachment_content_type || 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
