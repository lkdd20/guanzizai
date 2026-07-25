import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'

const cacheControl = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

export function contentJsonResponse(request: Request, payload: unknown, revision: string) {
  const etag = `"${createHash('sha256').update(revision).digest('base64url')}"`
  const headers = {
    ETag: etag,
    'Cache-Control': cacheControl,
    'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    Vary: 'Accept-Encoding',
  }
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers })
  }
  return NextResponse.json(payload, { headers })
}
