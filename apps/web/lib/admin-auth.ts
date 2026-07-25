import { cookies, headers } from 'next/headers'

import { adminHomePath } from './admin-paths'

export const adminSessionCookie = '__Host-gzz_admin'

const sessionTtlSeconds = 60 * 60 * 8

function adminToken() {
  return process.env.ADMIN_ACCESS_TOKEN?.trim() ?? ''
}

function adminUsername() {
  return process.env.ADMIN_USERNAME?.trim() ?? ''
}

export function adminAccessConfigured() {
  return Boolean(adminToken())
}

export function adminUsernameConfigured() {
  return Boolean(adminUsername())
}

export function safeAdminNext(value: string | null | undefined) {
  const homePath = adminHomePath()
  if (!value || !value.startsWith('/') || value.startsWith('//')) return homePath
  if (value.startsWith('/api/')) return homePath
  if (value === homePath || value.startsWith(`${homePath}/`)) return value
  return homePath
}

export async function createAdminSessionValue(expiresAt = Math.floor(Date.now() / 1000) + sessionTtlSeconds) {
  const token = adminToken()
  if (!token) return undefined
  const signature = await sha256Hex(`${token}.${expiresAt}.guanzizai-admin`)
  return `${expiresAt}.${signature}`
}

export async function verifyAdminToken(value: string) {
  const token = adminToken()
  if (!token || !value) return false
  return constantTimeEqual(value.trim(), token)
}

export async function verifyAdminCredentials(username: string, token: string) {
  const expectedUsername = adminUsername()
  if (expectedUsername && !constantTimeEqual(username.trim(), expectedUsername)) return false
  return verifyAdminToken(token)
}

export async function hasAdminAccess() {
  const token = adminToken()
  if (!token) return false

  const requestHeaders = await headers()
  const authorization = requestHeaders.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const headerToken = requestHeaders.get('x-admin-token')?.trim()
  if ((authorization && constantTimeEqual(authorization, token)) || (headerToken && constantTimeEqual(headerToken, token))) {
    return true
  }

  const cookieStore = await cookies()
  const session = cookieStore.get(adminSessionCookie)?.value
  if (!session) return false
  return verifyAdminSession(session, token)
}

export async function verifyAdminSession(session: string, token = adminToken()) {
  if (!token) return false
  const [expiresAtRaw, signature] = session.split('.')
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) return false
  const expected = await sha256Hex(`${token}.${expiresAt}.guanzizai-admin`)
  return constantTimeEqual(signature, expected)
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    maxAge: sessionTtlSeconds,
    path: '/',
    sameSite: 'lax' as const,
    secure: true,
  }
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
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
