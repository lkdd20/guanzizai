import { NextResponse } from 'next/server'

import { deleteAccountBookmark, listAccountBookmarks, upsertAccountBookmark } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  try {
    const workId = clean(new URL(request.url).searchParams.get('workId'), 180)
    const bookmarks = await listAccountBookmarks(session.user, 100, workId || undefined)
    return NextResponse.json({ bookmarks }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'bookmarks_unavailable' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const sequence = Number(body?.sequence)
  const input = {
    workId: clean(body?.workId, 180),
    workTitle: clean(body?.workTitle, 180),
    passageId: clean(body?.passageId, 180),
    passageAnchor: clean(body?.passageAnchor, 180),
    sequence: Math.trunc(sequence),
    excerpt: clean(body?.excerpt, 500),
  }
  if (!input.workId || !input.workTitle || !input.passageId || !input.passageAnchor || !input.excerpt || !Number.isFinite(sequence) || sequence <= 0) {
    return NextResponse.json({ error: 'invalid_bookmark' }, { status: 400 })
  }
  try {
    return NextResponse.json({ bookmark: await upsertAccountBookmark(session.user, input) }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'bookmarks_unavailable' }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const id = clean(new URL(request.url).searchParams.get('id'), 80)
  if (!id) return NextResponse.json({ error: 'bookmark_id_required' }, { status: 400 })
  try {
    const deleted = await deleteAccountBookmark(session.user, id)
    return NextResponse.json({ deleted }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'bookmarks_unavailable' }, { status: 503 })
  }
}
