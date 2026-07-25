import { NextResponse } from 'next/server'

import { authSessionCookie, safeAuthNext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const form = await request.formData().catch(() => undefined)
  const next = safeAuthNext(String(form?.get('next') ?? '/'))
  const response = NextResponse.redirect(new URL(next, request.url), 303)
  response.cookies.set(authSessionCookie, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: true,
  })
  response.headers.set('cache-control', 'no-store')
  return response
}
