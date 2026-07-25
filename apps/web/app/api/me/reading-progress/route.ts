import { NextResponse } from 'next/server'

import { getAccountReadingProgress, saveAccountReadingProgress } from '@/lib/account-db'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const workId = clean(new URL(request.url).searchParams.get('workId'), 180)
  if (!workId) return NextResponse.json({ error: 'work_id_required' }, { status: 400 })
  try {
    const progress = await getAccountReadingProgress(session.user, workId)
    return NextResponse.json({ progress }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'progress_unavailable' }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const workId = clean(body?.workId, 180)
  const contentVersion = clean(body?.contentVersion, 180)
  const passageId = clean(body?.passageId, 180)
  const deviceId = clean(body?.deviceId, 120)
  const sequence = Number(body?.sequence)
  const intraPassageRatio = Number(body?.intraPassageRatio ?? 0)
  const readerMode = clean(body?.readerMode, 24)
  const writingDirection = clean(body?.writingDirection, 24)
  const updatedAt = clean(body?.updatedAt, 40)
  const totalPassages = Number(body?.totalPassages)
  const progressRatio = Number(body?.progressRatio)
  if (!workId || !contentVersion || !passageId || !deviceId || !Number.isFinite(sequence) || sequence <= 0
    || !Number.isFinite(intraPassageRatio) || intraPassageRatio < 0 || intraPassageRatio > 1
    || !['original', 'plain', 'parallel'].includes(readerMode)
    || !['horizontal', 'vertical'].includes(writingDirection)
    || !Number.isFinite(totalPassages) || totalPassages <= 0
    || !Number.isFinite(progressRatio) || progressRatio < 0 || progressRatio > 1
    || !Number.isFinite(Date.parse(updatedAt))) {
    return NextResponse.json({ error: 'invalid_progress' }, { status: 400 })
  }
  try {
    const progress = await saveAccountReadingProgress(session.user, {
      workId,
      contentVersion,
      passageId,
      sequence: Math.trunc(sequence),
      intraPassageRatio,
      readerMode: readerMode as 'original' | 'plain' | 'parallel',
      writingDirection: writingDirection as 'horizontal' | 'vertical',
      deviceId,
      totalPassages: Math.trunc(totalPassages),
      progressRatio,
      updatedAt: new Date(updatedAt).toISOString(),
    })
    return NextResponse.json({ progress }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'progress_unavailable' }, { status: 503 })
  }
}
