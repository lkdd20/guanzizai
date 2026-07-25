import { NextResponse } from 'next/server'

import {
  authCookieOptions,
  authSessionCookie,
  createAuthSessionValue,
  emailAuthUser,
  verifyEmailLoginToken,
} from '@/lib/auth'
import { ensureAccountUser } from '@/lib/account-db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const token = requestUrl.searchParams.get('token') ?? ''
  const payload = await verifyEmailLoginToken(token)
  if (!payload) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'email-token-invalid')
    return NextResponse.redirect(loginUrl, 303)
  }

  const emailUser = emailAuthUser(payload.email)
  const user = await ensureAccountUser(emailUser).catch(() => emailUser)
  const sessionValue = await createAuthSessionValue(user)
  const response = NextResponse.redirect(new URL(payload.next, request.url), 303)
  response.cookies.set(authSessionCookie, sessionValue, authCookieOptions())
  response.headers.set('cache-control', 'no-store')
  return response
}
