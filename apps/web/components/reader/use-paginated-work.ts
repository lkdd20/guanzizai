'use client'

import { useEffect, useRef, useState } from 'react'

import { type SutraPassage, type SutraRecord } from '@/lib/content'
import { passagePageCacheKey } from '@/lib/reader-pagination'
import { getReaderCache, pruneReaderWorkVersions, putReaderCache } from '@/lib/reader-cache'

interface PassagePage {
  passages: SutraPassage[]
  hasMore: boolean
}

interface UsePaginatedWorkOptions {
  sutra: SutraRecord
  startSequence?: number
}

const passagePageCache = new Map<string, Promise<PassagePage>>()
const passageWindowSize = 30
const passageWindowPadding = Math.floor(passageWindowSize / 2)

export function usePaginatedWork({ sutra, startSequence }: UsePaginatedWorkOptions) {
  const contentVersion = encodeURIComponent(sutra.contentVersion ?? sutra.sourceBatch ?? 'static')
  const [loadedPassages, setLoadedPassages] = useState(sutra.passages)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [switchingSection, setSwitchingSection] = useState(false)
  const [pendingStartSequence, setPendingStartSequence] = useState<number | null>(null)
  const [currentStartSequence, setCurrentStartSequence] = useState(
    startSequence ?? sutra.outline?.[0]?.sequence ?? sutra.passages[0]?.seq,
  )
  const [hasMorePassages, setHasMorePassages] = useState(Boolean(sutra.paginated))
  const [outline, setOutline] = useState(sutra.outline ?? [])
  const [outlineLoading, setOutlineLoading] = useState(Boolean(sutra.paginated && !sutra.outline?.length))
  const sectionRequestRef = useRef<AbortController | null>(null)
  const loadMoreRequestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void pruneReaderWorkVersions(sutra.id, contentVersion)
  }, [contentVersion, sutra.id])

  useEffect(() => {
    if (!sutra.paginated || outline.length) {
      setOutlineLoading(false)
      return undefined
    }
    const controller = new AbortController()
    setOutlineLoading(true)
    const cacheKey = `${sutra.id}:${contentVersion}:outline`
    getReaderCache<{ outline?: NonNullable<SutraRecord['outline']> }>(cacheKey)
      .then(async (cached) => {
        if (cached) return cached
        const response = await fetch(`/api/content/works/${encodeURIComponent(sutra.id)}/outline?v=${contentVersion}`, { signal: controller.signal })
        if (!response.ok) return null
        const payload = await response.json() as { outline?: NonNullable<SutraRecord['outline']> }
        void putReaderCache(cacheKey, payload)
        return payload
      })
      .then((payload: { outline?: NonNullable<SutraRecord['outline']> } | null) => {
        if (payload?.outline) setOutline(payload.outline)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setOutlineLoading(false)
      })
    return () => controller.abort()
  }, [contentVersion, outline.length, sutra.id, sutra.paginated])

  useEffect(() => () => {
    sectionRequestRef.current?.abort()
    loadMoreRequestRef.current?.abort()
  }, [])

  function fetchPassagePage(sequence: number, signal?: AbortSignal) {
    const key = passagePageCacheKey(sutra.id, contentVersion, sequence)
    const cached = passagePageCache.get(key)
    if (cached) return cached
    const request = (async () => {
      const cached = await getReaderCache<PassagePage>(key)
      if (cached) return cached
      const response = await fetch(
        `/api/content/works/${encodeURIComponent(sutra.id)}/passages?after=${Math.max(0, sequence - 1)}&limit=${passageWindowSize}&v=${contentVersion}&shape=notes-keywords-v2`,
        { signal },
      )
      if (!response.ok) throw new Error('section_load_failed')
      const payload = await response.json() as PassagePage
      void putReaderCache(key, payload)
      return payload
    })().catch((error) => {
      passagePageCache.delete(key)
      throw error
    })
    passagePageCache.set(key, request)
    return request
  }

  function sectionWindowStart(sequence: number) {
    return Math.max(1, sequence - passageWindowPadding)
  }

  function prefetchSection(sequence: number) {
    if (!sutra.paginated || sequence === currentStartSequence) return
    void fetchPassagePage(sectionWindowStart(sequence)).catch(() => undefined)
  }

  function prefetchAdjacentSections(sequence: number) {
    const index = outline.findIndex((item) => item.sequence === sequence)
    if (index < 0) return
    const previous = outline[index - 1]
    const next = outline[index + 1]
    if (previous) prefetchSection(previous.sequence)
    if (next) prefetchSection(next.sequence)
  }

  async function loadSectionData(sequence: number) {
    if (!sutra.paginated || sequence === currentStartSequence) return null
    sectionRequestRef.current?.abort()
    const controller = new AbortController()
    sectionRequestRef.current = controller
    setPendingStartSequence(sequence)
    setSwitchingSection(true)
    try {
      const payload = await fetchPassagePage(sectionWindowStart(sequence), controller.signal)
      if (controller.signal.aborted) throw new DOMException('Section request aborted', 'AbortError')
      if (!payload.passages.length) throw new Error('section_empty')
      setLoadedPassages(payload.passages)
      setCurrentStartSequence(sequence)
      setHasMorePassages(payload.hasMore)
      window.setTimeout(() => prefetchAdjacentSections(sequence), 0)
      return payload
    } finally {
      if (sectionRequestRef.current === controller) {
        sectionRequestRef.current = null
        setPendingStartSequence(null)
        setSwitchingSection(false)
      }
    }
  }

  async function loadMorePassages() {
    if (!sutra.paginated || !hasMorePassages || loadingMore) return null
    const controller = new AbortController()
    loadMoreRequestRef.current?.abort()
    loadMoreRequestRef.current = controller
    setLoadingMore(true)
    try {
      const after = loadedPassages.at(-1)?.seq ?? 0
      const payload = await fetchPassagePage(after + 1, controller.signal)
      if (controller.signal.aborted) return null
      setLoadedPassages((current) => {
        const seen = new Set(current.map((passage) => passage.id))
        return [...current, ...payload.passages.filter((passage) => !seen.has(passage.id))]
      })
      setHasMorePassages(payload.hasMore)
      return payload
    } finally {
      if (loadMoreRequestRef.current === controller) {
        loadMoreRequestRef.current = null
        setLoadingMore(false)
      }
    }
  }

  async function loadPreviousPassages() {
    if (!sutra.paginated || loadingPrevious) return null
    const firstSequence = loadedPassages[0]?.seq ?? 1
    if (firstSequence <= 1) return null
    const controller = new AbortController()
    const previousStart = Math.max(1, firstSequence - passageWindowSize)
    const previousScrollHeight = document.documentElement.scrollHeight
    setLoadingPrevious(true)
    try {
      const payload = await fetchPassagePage(previousStart, controller.signal)
      if (controller.signal.aborted) return null
      setLoadedPassages((current) => {
        const first = current[0]?.seq ?? firstSequence
        const previous = payload.passages.filter((passage) => passage.seq < first)
        if (!previous.length) return current
        const next = [...previous, ...current]
        window.requestAnimationFrame(() => {
          const heightDelta = document.documentElement.scrollHeight - previousScrollHeight
          if (heightDelta > 0) window.scrollBy({ top: heightDelta, behavior: 'auto' })
        })
        return next
      })
      return payload
    } finally {
      setLoadingPrevious(false)
    }
  }

  function cancelSectionLoad() {
    sectionRequestRef.current?.abort()
  }

  function cancelLoadMore() {
    loadMoreRequestRef.current?.abort()
  }

  return {
    contentVersion,
    loadedPassages,
    setLoadedPassages,
    loadingMore,
    loadingPrevious,
    switchingSection,
    pendingStartSequence,
    currentStartSequence,
    hasMorePassages,
    outline,
    outlineLoading,
    loadSectionData,
    loadMorePassages,
    loadPreviousPassages,
    hasPreviousPassages: (loadedPassages[0]?.seq ?? 1) > 1,
    prefetchSection,
    prefetchAdjacentSections,
    cancelSectionLoad,
    cancelLoadMore,
  }
}
