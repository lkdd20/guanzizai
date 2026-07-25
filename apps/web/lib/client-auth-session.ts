'use client'

export interface ClientAuthUser {
  id: string
  name: string
  email: string
  avatarUrl?: string
}

export interface ClientAuthSession {
  authenticated: boolean
  user: ClientAuthUser | null
  expiresAt?: number | null
}

let cachedSession: ClientAuthSession | null = null
let sessionRequest: Promise<ClientAuthSession> | null = null

export function loadClientAuthSession() {
  if (cachedSession) return Promise.resolve(cachedSession)
  if (sessionRequest) return sessionRequest
  sessionRequest = fetch('/api/auth/session', {
    cache: 'no-store',
  })
    .then(async (response) => response.ok ? await response.json() as ClientAuthSession : null)
    .then((payload) => {
      cachedSession = payload?.authenticated && payload.user
        ? { authenticated: true, user: payload.user, expiresAt: payload.expiresAt }
        : { authenticated: false, user: null, expiresAt: payload?.expiresAt }
      return cachedSession
    })
    .catch(() => {
      cachedSession = { authenticated: false, user: null }
      return cachedSession
    })
    .finally(() => {
      sessionRequest = null
    })
  return sessionRequest
}

export function clearClientAuthSession() {
  cachedSession = null
  sessionRequest = null
}
