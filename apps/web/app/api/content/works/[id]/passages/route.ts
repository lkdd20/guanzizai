import { NextResponse } from 'next/server'

import { getPublishedPassagePage } from '@/lib/content-db'
import { contentJsonResponse } from '@/lib/content-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const after = Math.max(0, Number(url.searchParams.get('after') ?? 0))
  const limit = Number(url.searchParams.get('limit') ?? 30)
  const page = await getPublishedPassagePage(id, after, limit)
  if (!page) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const passages = page.passages
  const payload = {
    passages: passages.map((passage) => ({
      id: passage.id,
      anchorId: passage.id,
      seq: passage.sequence,
      juan: passage.juan,
      sourceRef: `${id} · 卷 ${passage.juan} · 段 ${String(passage.sequence).padStart(6, '0')}`,
      original: passage.original,
      plain: passage.translation,
      translationOrigin: passage.translationOrigin ?? undefined,
      translationLabel: passage.translationOrigin === 'licensed'
        ? passage.translationSourceName ?? '授权译本'
        : passage.translationOrigin === 'ai' ? 'AI 白话辅助' : passage.translationOrigin === 'manual' ? '人工白话' : undefined,
      translationContributor: passage.translationContributor ?? undefined,
      translationSegments: passage.translationSegments,
      enrichmentAvailable: passage.enrichmentAvailable,
      readingNotes: passage.readingNotes,
      keywords: passage.keywords,
      terms: [],
    })),
    total: page.total,
    nextAfter: passages.at(-1)?.sequence ?? after,
    hasMore: passages.length > 0 && passages.length >= Math.max(1, Math.min(100, Math.trunc(limit))),
  }
  return contentJsonResponse(request, payload, `${id}:${url.searchParams.get('v') ?? 'current'}:${after}:${limit}`)
}
