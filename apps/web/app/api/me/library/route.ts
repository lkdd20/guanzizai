import { NextResponse } from 'next/server'

import { getAccountReadingProgress, listAccountReadingProgress } from '@/lib/account-db'
import { listAccountBookmarks, listAccountHighlights } from '@/lib/account-library-db'
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
    if (workId) {
      const [bookmarks, highlights, progress] = await Promise.all([
        listAccountBookmarks(session.user, 100, workId),
        listAccountHighlights(session.user, workId),
        getAccountReadingProgress(session.user, workId),
      ])
      return NextResponse.json({ bookmarks, highlights, progress }, { headers: { 'cache-control': 'no-store' } })
    }
    const works = await listAccountReadingProgress(session.user)
    return NextResponse.json({ works }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'library_unavailable' }, { status: 503 })
  }
}
