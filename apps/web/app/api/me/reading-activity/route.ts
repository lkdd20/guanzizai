import { NextResponse } from 'next/server'

import { recordReadingActivity } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const workId = typeof body?.workId === 'string' ? body.workId.trim().slice(0, 180) : ''
  const seconds = Math.trunc(Number(body?.seconds))
  const progressRatio = Number(body?.progressRatio)
  if (!workId || !Number.isFinite(seconds) || seconds < 1 || seconds > 120 || !Number.isFinite(progressRatio) || progressRatio < 0 || progressRatio > 1) {
    return NextResponse.json({ error: 'invalid_activity' }, { status: 400 })
  }
  try {
    await recordReadingActivity(session.user, workId, seconds, progressRatio)
    return NextResponse.json({ recorded: true }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'activity_unavailable' }, { status: 503 })
  }
}
