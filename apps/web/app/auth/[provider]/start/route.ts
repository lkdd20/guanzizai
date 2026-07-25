import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import {
  authSessionConfigured,
  createOAuthState,
  oauthAuthorizationUrl,
  oauthProviderConfigured,
  oauthStateCookie,
  parseOAuthProvider,
  safeAuthNext,
  transientCookieOptions,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const requestUrl = new URL(_request.url)
  const mode = requestUrl.searchParams.get('mode') === 'register' ? 'register' : 'login'
  const entryPath = mode === 'register' ? '/register' : '/login'
  const { provider } = await params
  const oauthProvider = parseOAuthProvider(provider)

  if (!oauthProvider) {
    redirect(`${entryPath}?error=provider-not-supported`)
  }

  const next = safeAuthNext(requestUrl.searchParams.get('next'))
  if (!authSessionConfigured()) {
    redirect(`${entryPath}?error=auth-not-configured&provider=${oauthProvider}`)
  }
  if (!oauthProviderConfigured(oauthProvider)) {
    redirect(`${entryPath}?error=oauth-not-configured&provider=${oauthProvider}`)
  }

  const state = await createOAuthState(oauthProvider, next)
  const response = NextResponse.redirect(oauthAuthorizationUrl(oauthProvider, state, _request.url), 303)
  response.cookies.set(oauthStateCookie, state, transientCookieOptions(60 * 10))
  response.headers.set('cache-control', 'no-store')
  return response
}
