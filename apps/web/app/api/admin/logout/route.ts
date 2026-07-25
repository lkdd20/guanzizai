import { NextResponse } from 'next/server'

import { adminSessionCookie } from '@/lib/admin-auth'
import { adminEntryParam, hasValidAdminEntry } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  const requestUrl = new URL(request.url)
  if (!hasValidAdminEntry(requestUrl.searchParams.get(adminEntryParam))) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  const response = NextResponse.redirect(new URL('/', request.url), 303)
  response.cookies.set(adminSessionCookie, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: true,
  })
  response.headers.set('cache-control', 'no-store')
  return response
}
