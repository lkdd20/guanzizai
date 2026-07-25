import { NextResponse } from 'next/server'

import { askAgentConfigFromRuntime, normalizeAskHistory, normalizeAskQuestion, runGuanzizaiAskAgent } from '@/lib/ask-agent'
import { createGuestAskUsageValue, getAuthSession, guestAskCookie, guestAskLimit, verifyGuestAskUsage } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 40

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { history?: unknown; mode?: unknown; question?: unknown } | null
  const question = normalizeAskQuestion(body?.question)
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }

  const localOnly = body?.mode === 'local'
  const session = localOnly ? null : await getAuthSession()
  const cookieHeader = request.headers.get('cookie') ?? ''
  const guestCookieValue = cookieHeader.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${guestAskCookie}=`))?.slice(guestAskCookie.length + 1)
  const guestUsage = session || localOnly ? null : await verifyGuestAskUsage(guestCookieValue ? decodeURIComponent(guestCookieValue) : undefined)
  if (guestUsage && guestUsage.count >= guestAskLimit) {
    return NextResponse.json({ error: 'guest_limit', guest: { limit: guestAskLimit, used: guestUsage.count, remaining: 0 } }, { status: 403 })
  }

  const agentConfig = localOnly
    ? { baseUrl: 'https://example.invalid', model: 'local-grounded-rules' }
    : await askAgentConfigFromRuntime()
  const result = await runGuanzizaiAskAgent(
    question,
    agentConfig,
    normalizeAskHistory(body?.history),
  )
  const shouldCountGuestTurn = Boolean(guestUsage && result.mode === 'model')
  const nextCount = guestUsage ? guestUsage.count + (shouldCountGuestTurn ? 1 : 0) : 0
  const response = NextResponse.json({
    ...result,
    guest: guestUsage ? { limit: guestAskLimit, used: nextCount, remaining: Math.max(0, guestAskLimit - nextCount) } : undefined,
  }, {
    headers: {
      'cache-control': 'no-store',
    },
  })
  if (guestUsage && shouldCountGuestTurn) {
    response.cookies.set(guestAskCookie, await createGuestAskUsageValue(nextCount), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
  }
  return response
}
