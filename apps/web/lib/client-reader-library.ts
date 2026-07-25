'use client'

import { type AccountBookmark, type AccountHighlight } from './account-library'
import { type ReadingProgressRecord } from './reading-progress'

interface ClientReaderLibrary {
  bookmarks: AccountBookmark[]
  highlights: AccountHighlight[]
  progress: ReadingProgressRecord | null
}

const requests = new Map<string, Promise<ClientReaderLibrary>>()

export function loadClientReaderLibrary(workId: string) {
  const existing = requests.get(workId)
  if (existing) return existing
  const request = fetch(`/api/me/library?workId=${encodeURIComponent(workId)}`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('reader_library_unavailable')
      const payload = await response.json() as Partial<ClientReaderLibrary>
      return {
        bookmarks: payload.bookmarks ?? [],
        highlights: payload.highlights ?? [],
        progress: payload.progress ?? null,
      }
    })
    .catch((error) => {
      throw error
    })
    .finally(() => {
      requests.delete(workId)
    })
  requests.set(workId, request)
  return request
}
