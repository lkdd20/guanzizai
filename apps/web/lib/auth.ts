import { cookies } from 'next/headers'

export type AuthProvider = 'github' | 'google' | 'email'

export type AuthUser = {
  id: string
  provider: AuthProvider
  email: string
  name: string
  avatarUrl?: string
}

export type AuthSession = {
  user: AuthUser
  issuedAt: number
  expiresAt: number
}

type OAuthProvider = Exclude<AuthProvider, 'email'>

type OAuthState = {
  provider: OAuthProvider
  next: string
  issuedAt: number
  expiresAt: number
  nonce: string
}

type EmailLoginToken = {
  email: string
  next: string
  issuedAt: number
  expiresAt: number
  nonce: string
}

export const authSessionCookie = '__Host-gzz_session'
export const oauthStateCookie = '__Host-gzz_oauth_state'
export const guestAskCookie = '__Host-gzz_ask_guest'
export const guestAskLimit = 3

const sessionTtlSeconds = 60 * 60 * 24 * 30
const oauthStateTtlSeconds = 60 * 10
const emailLoginTtlSeconds = 60 * 15
const guestAskTtlSeconds = 60 * 60 * 24 * 30

type GuestAskUsage = { count: number; expiresAt: number }

const oauthProviders = new Set<OAuthProvider>(['github', 'google'])

export function authSecret() {
  return process.env.AUTH_SESSION_SECRET?.trim() ?? ''
}

export function authSessionConfigured() {
  return Boolean(authSecret())
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function safeAuthNext(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account'
  if (value.startsWith('/api/') || value.startsWith('/auth/')) return '/account'
  return value
}

export function providerLabel(provider: string) {
  if (provider === 'github') return 'GitHub'
  if (provider === 'google') return 'Google'
  if (provider === 'email') return '邮箱'
  return '第三方'
}

export function parseOAuthProvider(value: string): OAuthProvider | undefined {
  return oauthProviders.has(value as OAuthProvider) ? (value as OAuthProvider) : undefined
}

export function oauthProviderConfigured(provider: OAuthProvider) {
  if (provider === 'github') {
    return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim())
  }
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}

export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_PORT?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim() &&
      process.env.SMTP_FROM?.trim(),
  )
}

export function authCookieOptions(maxAge = sessionTtlSeconds) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: true,
  }
}

export function transientCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: true,
  }
}

export async function createAuthSessionValue(user: AuthUser) {
  const now = unixNow()
  return signJson<AuthSession>(
    {
      user,
      issuedAt: now,
      expiresAt: now + sessionTtlSeconds,
    },
    'auth-session',
  )
}

export async function getAuthSession() {
  const cookieStore = await cookies()
  const value = cookieStore.get(authSessionCookie)?.value
  if (!value) return null
  return verifyAuthSession(value)
}

export async function verifyAuthSession(value: string) {
  const session = await verifySignedJson<AuthSession>(value, 'auth-session')
  if (!session || session.expiresAt < unixNow()) return null
  if (!session.user?.email || !session.user?.provider || !session.user?.id) return null
  return session
}

export async function createGuestAskUsageValue(count: number) {
  return signJson<GuestAskUsage>({ count: Math.max(0, Math.trunc(count)), expiresAt: unixNow() + guestAskTtlSeconds }, 'guest-ask')
}

export async function verifyGuestAskUsage(value: string | undefined) {
  if (!value) return { count: 0, expiresAt: unixNow() + guestAskTtlSeconds }
  const usage = await verifySignedJson<GuestAskUsage>(value, 'guest-ask')
  if (!usage || usage.expiresAt < unixNow() || !Number.isFinite(usage.count)) {
    return { count: 0, expiresAt: unixNow() + guestAskTtlSeconds }
  }
  return { count: Math.max(0, Math.trunc(usage.count)), expiresAt: usage.expiresAt }
}

export async function createOAuthState(provider: OAuthProvider, next: string) {
  const now = unixNow()
  return signJson<OAuthState>(
    {
      provider,
      next: safeAuthNext(next),
      issuedAt: now,
      expiresAt: now + oauthStateTtlSeconds,
      nonce: randomToken(),
    },
    'oauth-state',
  )
}

export async function verifyOAuthState(value: string, expectedProvider: OAuthProvider) {
  const state = await verifySignedJson<OAuthState>(value, 'oauth-state')
  if (!state || state.expiresAt < unixNow()) return null
  if (state.provider !== expectedProvider) return null
  return state
}

export async function createEmailLoginToken(email: string, next: string) {
  const now = unixNow()
  return signJson<EmailLoginToken>(
    {
      email: normalizeEmail(email),
      next: safeAuthNext(next),
      issuedAt: now,
      expiresAt: now + emailLoginTtlSeconds,
      nonce: randomToken(),
    },
    'email-login',
  )
}

export async function verifyEmailLoginToken(value: string) {
  const token = await verifySignedJson<EmailLoginToken>(value, 'email-login')
  if (!token || token.expiresAt < unixNow()) return null
  if (!isLikelyEmail(token.email)) return null
  return token
}

export function oauthAuthorizationUrl(provider: OAuthProvider, state: string, requestUrl: string) {
  const redirectUri = authCallbackUrl(provider, requestUrl)
  if (provider === 'github') {
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID?.trim() ?? '')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', 'read:user user:email')
    url.searchParams.set('state', state)
    return url
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID?.trim() ?? '')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url
}

export function authCallbackUrl(provider: OAuthProvider, requestUrl: string) {
  return new URL(`/auth/${provider}/callback`, requestUrl).toString()
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string, requestUrl: string) {
  if (provider === 'github') {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID?.trim(),
        client_secret: process.env.GITHUB_CLIENT_SECRET?.trim(),
        code,
        redirect_uri: authCallbackUrl(provider, requestUrl),
      }),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('GitHub token exchange failed')
    const payload = (await response.json()) as { access_token?: string; error?: string }
    if (!payload.access_token || payload.error) throw new Error('GitHub token missing')
    return payload.access_token
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: authCallbackUrl(provider, requestUrl),
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Google token exchange failed')
  const payload = (await response.json()) as { access_token?: string; error?: string }
  if (!payload.access_token || payload.error) throw new Error('Google token missing')
  return payload.access_token
}

export async function fetchOAuthUser(provider: OAuthProvider, accessToken: string): Promise<AuthUser> {
  if (provider === 'github') {
    const profileResponse = await fetch('https://api.github.com/user', {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'x-github-api-version': '2022-11-28',
      },
      cache: 'no-store',
    })
    if (!profileResponse.ok) throw new Error('GitHub profile fetch failed')
    const profile = (await profileResponse.json()) as {
      id?: number
      login?: string
      name?: string | null
      email?: string | null
      avatar_url?: string | null
    }

    let email = profile.email ?? ''
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${accessToken}`,
          'x-github-api-version': '2022-11-28',
        },
        cache: 'no-store',
      })
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email?: string
          primary?: boolean
          verified?: boolean
        }>
        email =
          emails.find((item) => item.primary && item.verified)?.email ??
          emails.find((item) => item.verified)?.email ??
          ''
      }
    }

    if (!profile.id || !email) throw new Error('GitHub account has no verified email')
    return {
      id: `github:${profile.id}`,
      provider: 'github',
      email: normalizeEmail(email),
      name: profile.name?.trim() || profile.login?.trim() || normalizeEmail(email),
      avatarUrl: profile.avatar_url ?? undefined,
    }
  }

  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Google profile fetch failed')
  const profile = (await response.json()) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
  }
  if (!profile.sub || !profile.email || profile.email_verified === false) throw new Error('Google email not verified')
  return {
    id: `google:${profile.sub}`,
    provider: 'google',
    email: normalizeEmail(profile.email),
    name: profile.name?.trim() || normalizeEmail(profile.email),
    avatarUrl: profile.picture,
  }
}

export function emailAuthUser(email: string): AuthUser {
  const normalized = normalizeEmail(email)
  return {
    id: `email:${normalized}`,
    provider: 'email',
    email: normalized,
    name: normalized,
  }
}

async function signJson<T>(payload: T, purpose: string) {
  const secret = authSecret()
  if (!secret) throw new Error('AUTH_SESSION_SECRET is not configured')
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await hmacSha256(`${purpose}.${encodedPayload}`, secret)
  return `${encodedPayload}.${signature}`
}

async function verifySignedJson<T>(value: string, purpose: string): Promise<T | null> {
  const secret = authSecret()
  if (!secret) return null
  const [encodedPayload, signature] = value.split('.')
  if (!encodedPayload || !signature) return null
  const expected = await hmacSha256(`${purpose}.${encodedPayload}`, secret)
  if (!constantTimeEqual(signature, expected)) return null
  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as T
  } catch {
    return null
  }
}

async function hmacSha256(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64UrlEncodeBytes(new Uint8Array(digest))
}

function randomToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return base64UrlEncodeBytes(bytes)
}

function unixNow() {
  return Math.floor(Date.now() / 1000)
}

function base64UrlEncode(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value))
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let diff = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return diff === 0
}
