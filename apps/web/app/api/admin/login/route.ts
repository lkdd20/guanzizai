import { NextResponse } from 'next/server'

import {
  adminCookieOptions,
  adminSessionCookie,
  createAdminSessionValue,
  safeAdminNext,
  verifyAdminCredentials,
} from '@/lib/admin-auth'
import { adminEntryParam, adminLoginPath, hasValidAdminEntry } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const baseUrl = new URL(request.url)
  if (!hasValidAdminEntry(baseUrl.searchParams.get(adminEntryParam))) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  const form = await request.formData()
  const username = String(form.get('username') ?? '')
  const token = String(form.get('token') ?? '')
  const next = safeAdminNext(String(form.get('next') ?? '/admin'))

  if (!(await verifyAdminCredentials(username, token))) {
    const redirectUrl = new URL(adminLoginPath(), baseUrl)
    redirectUrl.searchParams.set('error', 'invalid')
    redirectUrl.searchParams.set('next', next)
    return NextResponse.redirect(redirectUrl, 303)
  }

  const sessionValue = await createAdminSessionValue()
  if (!sessionValue) {
    const redirectUrl = new URL(adminLoginPath(), baseUrl)
    redirectUrl.searchParams.set('next', next)
    return NextResponse.redirect(redirectUrl, 303)
  }

  const response = NextResponse.redirect(new URL(next, baseUrl), 303)
  response.cookies.set(adminSessionCookie, sessionValue, adminCookieOptions())
  response.headers.set('cache-control', 'no-store')
  return response
}
