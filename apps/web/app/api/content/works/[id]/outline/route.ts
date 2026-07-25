import { NextResponse } from 'next/server'

import { getPublishedOutline } from '@/lib/content-db'
import { contentJsonResponse } from '@/lib/content-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const outline = await getPublishedOutline(id)
  const payload = {
    outline: outline.map((item) => ({
      key: item.key,
      sequence: item.sequence,
      endSequence: item.endSequence,
      title: item.title,
      anchorId: `${id}-section-${item.key}`,
      kind: item.kind,
      level: item.level,
      parentKey: item.parentKey ?? undefined,
    })),
  }
  return contentJsonResponse(request, payload, `${id}:${new URL(request.url).searchParams.get('v') ?? 'current'}:outline`)
}
