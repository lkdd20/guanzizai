import { sutraById, sutraLibraryEntries, type SutraRecord } from '@/lib/content'
import { createHash } from 'node:crypto'

import { getPublishedPassages, getPublishedWork, listPublishedCatalogWorks } from '@/lib/content-db'
import { readWorkObject } from '@/lib/content-object-store'

// Public reads are fail-closed for database content and fail-open for the original sample.
export async function getPublicWorkById(id: string, requestedStart?: number) {
  const fallback = sutraById(id)
  if (fallback) return { source: 'static' as const, work: fallback }
  try {
    // These reads only depend on the public id, so start them together. Waiting
    // for work metadata before requesting the first reading window added a full
    // Vercel -> PostgreSQL round trip to every cold navigation.
    const requestedAfter = requestedStart && requestedStart > 0 ? requestedStart - 1 : 0
    const [work, databasePassages] = await Promise.all([
      getPublishedWork(id),
      getPublishedPassages(id, requestedAfter, 15),
    ])
    if (!work) return null
    const object = databasePassages.length || !work.contentObjectKey || !work.contentObjectHash
      ? null
      : await readWorkObject(work.contentObjectKey, work.contentObjectHash, work.contentHash)
    const passages = object?.passages ?? databasePassages
    if (!passages.length) return null
    for (const passage of passages) {
      if (createHash('sha256').update(passage.original).digest('hex') !== passage.contentHash) return null
    }
    const sutra: SutraRecord = {
      id: work.id,
      library: '国学',
      sourceVerification: work.sourceVerification === 'verified' ? 'verified' : 'unverified',
      sourceBatch: work.sourceBatch,
      aliases: [],
      title: work.title,
      shortTitle: `《${work.title}》`,
      dynasty: work.dynasty ?? '年代待考',
      translator: work.author ?? '作者待考',
      sourceEdition: work.sourceEdition,
      sourceUrl: work.sourcePath.startsWith('https://') ? work.sourcePath : undefined,
      contentVersion: work.contentRevision,
      category: work.category ?? '古籍',
      description: '本作品原文来自已记录来源，核验状态与发布状态分开管理。',
      overview: {
        summary: work.publishedTranslationCount > 0
          ? work.publishedTranslationCount >= work.passageCount
            ? '已提供全书原文与 AI 白话分节对照，可在阅读模式中切换查看。'
            : `已提供原文及 ${work.publishedTranslationCount} 段 AI 白话辅助，可在阅读模式中切换查看。`
          : '当前页面优先展示原文；作品尚无已发布白话译文。',
        source: 'manual',
        updatedAt: work.importedAt.slice(0, 10),
        reviewer: '观自在内容库',
        note: '批量结构化内容，核验等级见页面提示。',
      },
      juanCount: Math.max(1, work.juanCount, ...passages.map((passage) => passage.juan)),
      passages: passages.map((passage) => {
        const translation = 'translation' in passage && typeof passage.translation === 'string' ? passage.translation : ''
        const rawOrigin = 'translationOrigin' in passage ? passage.translationOrigin : null
        const origin = rawOrigin === 'ai' || rawOrigin === 'licensed' || rawOrigin === 'manual' ? rawOrigin : null
        const sourceName = 'translationSourceName' in passage && typeof passage.translationSourceName === 'string'
          ? passage.translationSourceName
          : null
        const contributor = 'translationContributor' in passage && typeof passage.translationContributor === 'string'
          ? passage.translationContributor
          : null
        return {
          id: passage.id,
          anchorId: passage.id,
          seq: passage.sequence,
          juan: passage.juan,
          sourceRef: `${work.id} · 卷 ${passage.juan} · 段 ${String(passage.sequence).padStart(6, '0')}`,
          original: passage.original,
          plain: translation,
          translationOrigin: origin ?? undefined,
          translationLabel: origin === 'licensed'
            ? sourceName ?? '授权译本'
            : origin === 'ai' ? 'AI 白话辅助' : origin === 'manual' ? '人工白话' : undefined,
          translationContributor: contributor ?? undefined,
          translationSegments: 'translationSegments' in passage && Array.isArray(passage.translationSegments)
            ? passage.translationSegments
            : undefined,
          enrichmentAvailable: 'enrichmentAvailable' in passage && passage.enrichmentAvailable === true,
          readingNotes: 'readingNotes' in passage && Array.isArray(passage.readingNotes)
            ? passage.readingNotes
            : undefined,
          keywords: 'keywords' in passage && Array.isArray(passage.keywords)
            ? passage.keywords
            : undefined,
          terms: [],
        }
      }),
      passageCount: Math.max(0, work.passageCount - work.readingStartSequence),
      characterCount: work.characterCount,
      paginated: !object && work.passageCount - work.readingStartSequence > passages.length,
      // The directory can be expensive for legacy long works. It is fetched
      // independently after the readable first window has rendered.
      outline: [],
    }
    return { source: 'database' as const, work: sutra }
  } catch {
    return null
  }
}

export async function getPublicCatalog() {
  try {
    const databaseWorks = await listPublishedCatalogWorks()
    return {
      staticEntries: sutraLibraryEntries.filter((entry) => entry.available),
      databaseWorks: databaseWorks.filter((work) => work.publicationStatus === 'published'),
    }
  } catch {
    return { staticEntries: sutraLibraryEntries.filter((entry) => entry.available), databaseWorks: [] }
  }
}
