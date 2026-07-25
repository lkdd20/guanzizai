import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { adminEntryParam, hasValidAdminEntry } from '@/lib/admin-paths'
import { sutraById } from '@/lib/content'
import { generateSutraOverviewDraft } from '@/lib/sutra-overview-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 40

const noStoreHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestUrl = new URL(request.url)
  if (!hasValidAdminEntry(requestUrl.searchParams.get(adminEntryParam))) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: noStoreHeaders,
    })
  }

  if (!(await hasAdminAccess())) {
    return NextResponse.json(
      { error: 'admin authorization required' },
      {
        status: 401,
        headers: noStoreHeaders,
      },
    )
  }

  const { id } = await context.params
  const sutra = sutraById(id)
  if (!sutra) {
    return NextResponse.json(
      { error: 'sutra not found' },
      {
        status: 404,
        headers: noStoreHeaders,
      },
    )
  }

  const draft = await generateSutraOverviewDraft(sutra)
  return NextResponse.json(draft, { headers: noStoreHeaders })
}
