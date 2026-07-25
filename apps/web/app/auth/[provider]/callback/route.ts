import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  authCookieOptions,
  authSessionCookie,
  createAuthSessionValue,
  exchangeOAuthCode,
  fetchOAuthUser,
  oauthStateCookie,
  parseOAuthProvider,
  verifyOAuthState,
} from '@/lib/auth'
import { ensureAccountUser } from '@/lib/account-db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const requestUrl = new URL(request.url)
  const { provider } = await params
  const oauthProvider = parseOAuthProvider(provider)
  if (!oauthProvider) return redirectToLogin(request.url, 'provider-not-supported')

  const error = requestUrl.searchParams.get('error')
  if (error) return redirectToLogin(request.url, 'oauth-denied', oauthProvider)

  const code = requestUrl.searchParams.get('code')
  const stateValue = requestUrl.searchParams.get('state')
  const cookieStore = await cookies()
  const cookieState = cookieStore.get(oauthStateCookie)?.value

  if (!code || !stateValue || !cookieState || stateValue !== cookieState) {
    return redirectToLogin(request.url, 'oauth-state-invalid', oauthProvider)
  }

  const state = await verifyOAuthState(stateValue, oauthProvider)
  if (!state) return redirectToLogin(request.url, 'oauth-state-invalid', oauthProvider)

  try {
    const accessToken = await exchangeOAuthCode(oauthProvider, code, request.url)
    const oauthUser = await fetchOAuthUser(oauthProvider, accessToken)
    const user = await ensureAccountUser(oauthUser).catch(() => oauthUser)
    const sessionValue = await createAuthSessionValue(user)
    const response = NextResponse.redirect(new URL(state.next, request.url), 303)
    response.cookies.set(authSessionCookie, sessionValue, authCookieOptions())
    response.cookies.set(oauthStateCookie, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
    response.headers.set('cache-control', 'no-store')
    return response
  } catch {
    return redirectToLogin(request.url, 'oauth-failed', oauthProvider)
  }
}

function redirectToLogin(requestUrl: string, error: string, provider?: string) {
  const url = new URL('/login', requestUrl)
  url.searchParams.set('error', error)
  if (provider) url.searchParams.set('provider', provider)
  return NextResponse.redirect(url, 303)
}
