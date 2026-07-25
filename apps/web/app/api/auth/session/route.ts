import { NextResponse } from 'next/server'

import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAuthSession()
  return NextResponse.json(
    {
      authenticated: Boolean(session),
      user: session?.user ?? null,
      expiresAt: session?.expiresAt ?? null,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}
