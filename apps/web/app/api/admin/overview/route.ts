import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { getAdminOverview } from '@/lib/admin-overview'
import { adminEntryParam, hasValidAdminEntry } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  if (!hasValidAdminEntry(requestUrl.searchParams.get(adminEntryParam))) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  if (!(await hasAdminAccess())) {
    return NextResponse.json(
      { error: 'admin authorization required' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex, nofollow',
        },
      },
    )
  }

  return NextResponse.json(await getAdminOverview(), {
    headers: {
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
