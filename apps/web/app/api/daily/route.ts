import { NextResponse } from 'next/server'

import { formatChinaDate, parseCalendarDate } from '@/lib/daily-calendar'
import { getDailyCalendarResponse } from '@/lib/daily-recommendation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isoDate = url.searchParams.get('date')?.trim() || formatChinaDate()
  if (!parseCalendarDate(isoDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 })
  }
  const result = await getDailyCalendarResponse(isoDate)
  return NextResponse.json(result, {
    headers: {
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
