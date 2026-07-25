'use client'

import { Copy, Highlighter, MessageSquareWarning, Share2 } from 'lucide-react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'

import { type AccountBookmark, type AccountHighlight, cleanSelectedText } from '@/lib/account-library'
import { loadClientReaderLibrary } from '@/lib/client-reader-library'
import { type SutraPassage, type SutraRecord } from '@/lib/content'

interface ReaderSelection {
  passage: SutraPassage
  text: string
  contextBefore: string
  contextAfter: string
  startOffset: number
  endOffset: number
  x: number
  y: number
}

interface UseReaderLibraryOptions {
  articleRef: RefObject<HTMLElement | null>
  sutra: SutraRecord
  contentVersion: string
  passages: SutraPassage[]
  activePassage?: SutraPassage
  authenticated: boolean
  progressRatio: number
}

interface LibraryNotice {
  state: 'saving' | 'saved' | 'error'
  message: string
}

function textWithoutRuby(node: Node) {
  const clone = node.cloneNode(true)
  if (clone instanceof Element || clone instanceof DocumentFragment) clone.querySelectorAll('rt').forEach((element) => element.remove())
  return cleanSelectedText(clone.textContent)
}

function selectionContext(container: Element, quote: string) {
  const source = textWithoutRuby(container)
  const start = source.indexOf(quote)
  if (start < 0) return { startOffset: 0, endOffset: quote.length, contextBefore: '', contextAfter: '' }
  return {
    startOffset: start,
    endOffset: start + quote.length,
    contextBefore: source.slice(Math.max(0, start - 40), start),
    contextAfter: source.slice(start + quote.length, start + quote.length + 40),
  }
}

function selectionUrl(sutra: SutraRecord, selection: ReaderSelection) {
  const params = new URLSearchParams({
    kind: 'correction',
    work: sutra.shortTitle,
    title: `${sutra.shortTitle}第 ${selection.passage.seq} 段阅读反馈`,
    description: `原文片段：${selection.text}\n\n请在这里补充反馈说明：`,
  })
  return `/contribute?${params.toString()}`
}

function applyCssHighlights(article: HTMLElement, highlights: AccountHighlight[]) {
  const registry = (CSS as typeof CSS & { highlights?: { set(name: string, value: unknown): void; delete(name: string): void } }).highlights
  const HighlightConstructor = (window as typeof window & { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (!registry || !HighlightConstructor) return
  if (!document.getElementById('guanzizai-reader-highlight-style')) {
    const style = document.createElement('style')
    style.id = 'guanzizai-reader-highlight-style'
    style.textContent = '::highlight(reader-highlights){color:inherit;background-color:color-mix(in srgb,var(--gold) 20%,transparent);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--gold) 68%,transparent);text-decoration-thickness:2px;text-underline-offset:5px}'
    document.head.appendChild(style)
  }
  const ranges: Range[] = []
  for (const highlight of highlights) {
    const container = article.querySelector(`#${CSS.escape(`${highlight.passageAnchor}-original`)}`)
    if (!container) continue
    const nodes: Text[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    while (current) {
      const text = current as Text
      if (!text.parentElement?.closest('rt')) nodes.push(text)
      current = walker.nextNode()
    }
    const source = nodes.map((node) => node.data).join('')
    const start = source.indexOf(highlight.selectedText)
    if (start < 0) continue
    const end = start + highlight.selectedText.length
    let cursor = 0
    let startNode: Text | null = null
    let endNode: Text | null = null
    let startOffset = 0
    let endOffset = 0
    for (const node of nodes) {
      const next = cursor + node.data.length
      if (!startNode && start >= cursor && start <= next) {
        startNode = node
        startOffset = start - cursor
      }
      if (!endNode && end >= cursor && end <= next) {
        endNode = node
        endOffset = end - cursor
        break
      }
      cursor = next
    }
    if (startNode && endNode) {
      const range = new Range()
      range.setStart(startNode, Math.min(startOffset, startNode.length))
      range.setEnd(endNode, Math.min(endOffset, endNode.length))
      ranges.push(range)
    }
  }
  if (ranges.length) registry.set('reader-highlights', new HighlightConstructor(...ranges))
  else registry.delete('reader-highlights')
}

export function useReaderLibrary({ articleRef, sutra, contentVersion, passages, activePassage, authenticated, progressRatio }: UseReaderLibraryOptions) {
  const [bookmarks, setBookmarks] = useState<AccountBookmark[]>([])
  const [highlights, setHighlights] = useState<AccountHighlight[]>([])
  const [selection, setSelection] = useState<ReaderSelection | null>(null)
  const [bookmarkBusy, setBookmarkBusy] = useState(false)
  const [libraryNotice, setLibraryNotice] = useState<LibraryNotice | null>(null)
  const libraryNoticeTimerRef = useRef<number | null>(null)
  const progressRef = useRef(progressRatio)
  progressRef.current = progressRatio

  useEffect(() => () => {
    if (libraryNoticeTimerRef.current) window.clearTimeout(libraryNoticeTimerRef.current)
  }, [])

  function showLibraryNotice(state: LibraryNotice['state'], message: string) {
    if (libraryNoticeTimerRef.current) window.clearTimeout(libraryNoticeTimerRef.current)
    setLibraryNotice({ state, message })
    if (state !== 'saving') {
      libraryNoticeTimerRef.current = window.setTimeout(() => setLibraryNotice(null), state === 'saved' ? 1600 : 3600)
    }
  }

  useEffect(() => {
    if (!authenticated) {
      setBookmarks([])
      setHighlights([])
      return undefined
    }
    let active = true
    void loadClientReaderLibrary(sutra.id).then((payload) => {
      if (!active) return
      setBookmarks(payload.bookmarks)
      setHighlights(payload.highlights)
    }).catch(() => undefined)
    return () => { active = false }
  }, [authenticated, sutra.id])

  useEffect(() => {
    const article = articleRef.current
    if (!article) return undefined
    applyCssHighlights(article, highlights)
    return () => {
      const registry = (CSS as typeof CSS & { highlights?: { delete(name: string): void } }).highlights
      registry?.delete('reader-highlights')
    }
  }, [articleRef, highlights, passages])

  useEffect(() => {
    const article = articleRef.current
    if (!article) return undefined
    const selectionArticle = article
    function updateSelection() {
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || selected.rangeCount !== 1) {
        setSelection(null)
        return
      }
      const range = selected.getRangeAt(0)
      const startElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
      const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
      const original = startElement?.closest('.read-original')
      if (!original || original !== endElement?.closest('.read-original') || !selectionArticle.contains(original)) {
        setSelection(null)
        return
      }
      const passageElement = original.closest<HTMLElement>('.read-passage')
      const passage = passages.find((item) => item.anchorId === passageElement?.id)
      const quote = textWithoutRuby(range.cloneContents())
      if (!passage || quote.length < 2 || quote.length > 1200) {
        setSelection(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const context = selectionContext(original, quote)
      setSelection({ passage, text: quote, ...context, x: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)), y: Math.max(76, rect.top - 10) })
    }
    function afterSelection() { window.setTimeout(updateSelection, 0) }
    article.addEventListener('pointerup', afterSelection)
    article.addEventListener('keyup', afterSelection)
    return () => {
      article.removeEventListener('pointerup', afterSelection)
      article.removeEventListener('keyup', afterSelection)
    }
  }, [articleRef, passages])

  useEffect(() => {
    if (!authenticated) return undefined
    let lastRecordedAt = Date.now()
    function record() {
      if (document.visibilityState !== 'visible') {
        lastRecordedAt = Date.now()
        return
      }
      const now = Date.now()
      const seconds = Math.min(60, Math.max(1, Math.round((now - lastRecordedAt) / 1000)))
      lastRecordedAt = now
      void fetch('/api/me/reading-activity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workId: sutra.id, seconds, progressRatio: progressRef.current }),
        keepalive: true,
      }).catch(() => undefined)
    }
    const timer = window.setInterval(record, 30000)
    function visibilityChanged() { if (document.visibilityState === 'visible') lastRecordedAt = Date.now() }
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [authenticated, sutra.id])

  const activeBookmark = useMemo(() => bookmarks.find((item) => item.passageId === activePassage?.id) ?? null, [activePassage?.id, bookmarks])

  async function toggleBookmark() {
    if (!authenticated) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    if (!activePassage || bookmarkBusy) return
    setBookmarkBusy(true)
    if (activeBookmark) {
      const removed = activeBookmark
      setBookmarks((items) => items.filter((item) => item.id !== removed.id))
      showLibraryNotice('saving', '已取消收藏，正在同步')
      try {
        const response = await fetch(`/api/me/bookmarks?id=${encodeURIComponent(removed.id)}`, { method: 'DELETE' })
        if (!response.ok) throw new Error('bookmark_delete_failed')
        showLibraryNotice('saved', '已取消收藏')
      } catch {
        setBookmarks((items) => [removed, ...items.filter((item) => item.id !== removed.id)])
        showLibraryNotice('error', '同步失败，收藏已恢复')
      } finally {
        setBookmarkBusy(false)
      }
      return
    }
    const optimisticId = `pending-bookmark-${window.crypto?.randomUUID?.() ?? Date.now()}`
    const optimistic: AccountBookmark = {
      id: optimisticId,
      workId: sutra.id,
      workTitle: sutra.shortTitle,
      passageId: activePassage.id,
      passageAnchor: activePassage.anchorId,
      sequence: activePassage.seq,
      excerpt: activePassage.original.slice(0, 500),
      createdAt: new Date().toISOString(),
    }
    setBookmarks((items) => [optimistic, ...items])
    showLibraryNotice('saving', '已收藏，正在同步')
    try {
      const response = await fetch('/api/me/bookmarks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workId: optimistic.workId,
          workTitle: optimistic.workTitle,
          passageId: optimistic.passageId,
          passageAnchor: optimistic.passageAnchor,
          sequence: optimistic.sequence,
          excerpt: optimistic.excerpt,
        }),
      })
      const payload = response.ok ? await response.json() as { bookmark?: AccountBookmark | null } : null
      if (!payload?.bookmark) throw new Error('bookmark_create_failed')
      setBookmarks((items) => items.map((item) => item.id === optimisticId ? payload.bookmark! : item))
      showLibraryNotice('saved', '收藏已保存')
    } catch {
      setBookmarks((items) => items.filter((item) => item.id !== optimisticId))
      showLibraryNotice('error', '同步失败，收藏已撤回')
    } finally {
      setBookmarkBusy(false)
    }
  }

  function clearSelection() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  async function copySelection() {
    if (!selection) return
    await navigator.clipboard.writeText(selection.text)
    clearSelection()
  }

  async function saveHighlight() {
    if (!selection) return
    if (!authenticated) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    const selected = selection
    const optimisticId = `pending-${window.crypto?.randomUUID?.() ?? Date.now()}`
    const optimistic: AccountHighlight = {
      id: optimisticId,
      workId: sutra.id,
      workTitle: sutra.shortTitle,
      passageId: selected.passage.id,
      passageAnchor: selected.passage.anchorId,
      sequence: selected.passage.seq,
      excerpt: selected.text,
      createdAt: new Date().toISOString(),
      contentVersion,
      selectedText: selected.text,
      contextBefore: selected.contextBefore,
      contextAfter: selected.contextAfter,
      startOffset: selected.startOffset,
      endOffset: selected.endOffset,
      color: 'gold',
    }
    setHighlights((items) => [...items, optimistic])
    clearSelection()
    showLibraryNotice('saving', '划线已标记，正在同步')
    try {
      const response = await fetch('/api/me/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workId: optimistic.workId,
          workTitle: optimistic.workTitle,
          contentVersion: optimistic.contentVersion,
          passageId: optimistic.passageId,
          passageAnchor: optimistic.passageAnchor,
          sequence: optimistic.sequence,
          selectedText: optimistic.selectedText,
          contextBefore: optimistic.contextBefore,
          contextAfter: optimistic.contextAfter,
          startOffset: optimistic.startOffset,
          endOffset: optimistic.endOffset,
          color: optimistic.color,
        }),
      })
      const payload = response.ok ? await response.json() as { highlight?: AccountHighlight | null } : null
      if (!payload?.highlight) throw new Error('highlight_sync_failed')
      setHighlights((items) => items.map((item) => item.id === optimisticId ? payload.highlight! : item))
      showLibraryNotice('saved', '划线已保存')
    } catch {
      setHighlights((items) => items.filter((item) => item.id !== optimisticId))
      showLibraryNotice('error', '同步失败，划线已撤回')
    }
  }

  async function shareSelection() {
    if (!selection) return
    const url = `${window.location.origin}/read/${sutra.id}?start=${selection.passage.seq}#${selection.passage.anchorId}`
    const text = `“${selection.text}”\n——${sutra.shortTitle}`
    if (navigator.share) await navigator.share({ title: sutra.title, text, url }).catch(() => undefined)
    else await navigator.clipboard.writeText(`${text}\n${url}`)
    clearSelection()
  }

  function reportSelection() {
    if (!selection) return
    window.location.assign(selectionUrl(sutra, selection))
  }

  return { activeBookmark, bookmarkBusy, toggleBookmark, selection, libraryNotice, copySelection, saveHighlight, shareSelection, reportSelection }
}

export function ReaderSelectionToolbar({ selection, onCopy, onHighlight, onShare, onReport }: {
  selection: ReaderSelection
  onCopy: () => void
  onHighlight: () => void
  onShare: () => void
  onReport: () => void
}) {
  return (
    <div className="read-selection-toolbar" role="toolbar" aria-label="选中文字操作" style={{ left: selection.x, top: selection.y }}>
      <button type="button" onClick={onCopy}><Copy /><span>复制</span></button>
      <button type="button" onClick={onHighlight}><Highlighter /><span>划线</span></button>
      <button type="button" onClick={onShare}><Share2 /><span>分享</span></button>
      <button type="button" onClick={onReport}><MessageSquareWarning /><span>反馈</span></button>
    </div>
  )
}
