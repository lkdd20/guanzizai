import { NextResponse } from 'next/server'

import { getPublishedPassageEnrichments } from '@/lib/content-db'
import { contentJsonResponse } from '@/lib/content-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const passageIds = new URL(request.url).searchParams.getAll('passageId')
  if (!passageIds.length || passageIds.length > 40) {
    return NextResponse.json({ error: 'invalid_passage_ids' }, { status: 400 })
  }
  const enrichments = await getPublishedPassageEnrichments(id, passageIds)
  const payload = {
    enrichments: enrichments.map((item) => ({
      passageId: item.passageId,
      enrichment: {
        sourceRecordId: item.sourceRecordId,
        titleTraditional: item.titleTraditional,
        titleSimplified: item.titleSimplified,
        titleIsOriginal: item.titleIsOriginal,
        originalTraditional: item.originalTraditional,
        originalSimplified: item.originalSimplified,
        originalSimplifiedPinyin: item.originalSimplifiedPinyin,
        pinyinStatus: item.pinyinStatus,
        keywords: item.keywords,
        readingNotes: item.readingNotes,
        sourceUrl: item.sourceUrl,
        sourceRevisionId: item.sourceRevisionId,
        sourceLicense: item.sourceLicense,
        sourceRecordHash: item.sourceRecordHash,
      },
    })),
  }
  const revision = new URL(request.url).searchParams.get('v') ?? 'current'
  return contentJsonResponse(request, payload, `${id}:${revision}:enrichments:${passageIds.sort().join(',')}`)
}
