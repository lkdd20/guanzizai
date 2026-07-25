'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'

import { type SutraPassage } from '@/lib/content'

interface UseReadingFocusOptions {
  articleRef: RefObject<HTMLElement | null>
  passages: SutraPassage[]
  initialPassageId: string
}

const focusRatio = 0.34
const programmaticScrollLockMs = 700

function closestVisibleNode(nodes: HTMLElement[], focusY: number) {
  return nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      const compactCanvas = node.closest<HTMLElement>('.read-compact-flow-canvas')
      if (!compactCanvas) return rect.bottom > 0 && rect.top < window.innerHeight
      const canvasRect = compactCanvas.getBoundingClientRect()
      return rect.bottom > canvasRect.top
        && rect.top < canvasRect.bottom
        && rect.right > canvasRect.left
        && rect.left < canvasRect.right
    })
    .sort((left, right) => {
      const compactCanvas = left.closest<HTMLElement>('.read-compact-flow-canvas')
      if (compactCanvas && compactCanvas === right.closest('.read-compact-flow-canvas')) {
        const canvasRect = compactCanvas.getBoundingClientRect()
        const readingEdge = canvasRect.right - Math.min(80, canvasRect.width * 0.12)
        return Math.abs(left.getBoundingClientRect().right - readingEdge)
          - Math.abs(right.getBoundingClientRect().right - readingEdge)
      }
      return Math.abs(left.getBoundingClientRect().top - focusY)
        - Math.abs(right.getBoundingClientRect().top - focusY)
    })[0]
}

export function useReadingFocus({ articleRef, passages, initialPassageId }: UseReadingFocusOptions) {
  const [activePassageId, setActivePassageId] = useState(initialPassageId)
  const [activeFocusId, setActiveFocusId] = useState('')
  const manualFocusRef = useRef(false)
  const manualFocusUntilRef = useRef(0)
  const releaseTimerRef = useRef<number | null>(null)

  function focusPassage(passageId: string, focusId = '') {
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = null
    manualFocusRef.current = true
    manualFocusUntilRef.current = Date.now() + programmaticScrollLockMs
    setActivePassageId(passageId)
    if (focusId) setActiveFocusId(focusId)
  }

  useEffect(() => {
    const article = articleRef.current
    if (!article || !('IntersectionObserver' in window)) return undefined
    const nodes = Array.from(article.querySelectorAll<HTMLElement>('.read-passage'))
    if (!nodes.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (manualFocusRef.current) return
        const visible = closestVisibleNode(
          entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement),
          window.innerHeight * focusRatio,
        )
        if (visible?.id) setActivePassageId(visible.id)
      },
      { rootMargin: '-22% 0px -62% 0px', threshold: [0, 0.2, 0.6] },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [articleRef, passages])

  useEffect(() => {
    const article = articleRef.current
    if (!article || !('IntersectionObserver' in window)) return undefined
    const nodes = Array.from(article.querySelectorAll<HTMLElement>('.read-source-line, .read-source-segment'))
    if (!nodes.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (manualFocusRef.current) return
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (
            Math.abs(a.boundingClientRect.top - window.innerHeight * focusRatio)
            - Math.abs(b.boundingClientRect.top - window.innerHeight * focusRatio)
          ))[0]
        if (current?.target.id) setActiveFocusId(current.target.id)
      },
      { rootMargin: '-26% 0px -58% 0px', threshold: [0, 0.15, 0.5] },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [articleRef, passages])

  useEffect(() => {
    let frame = 0
    function syncAutomaticFocus() {
      manualFocusRef.current = false
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const article = articleRef.current
        if (!article) return
        const focusY = window.innerHeight * focusRatio
        const passage = closestVisibleNode(
          Array.from(article.querySelectorAll<HTMLElement>('.read-passage')),
          focusY,
        )
        if (passage?.id) setActivePassageId(passage.id)

        const focusNode = closestVisibleNode(
          Array.from(article.querySelectorAll<HTMLElement>('.read-source-line, .read-source-segment')),
          focusY,
        )
        if (focusNode?.id) setActiveFocusId(focusNode.id)
      })
    }

    function resumeAutomaticFocus() {
      if (!manualFocusRef.current) return
      const remaining = manualFocusUntilRef.current - Date.now()
      if (remaining > 0) {
        if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current)
        releaseTimerRef.current = window.setTimeout(() => {
          releaseTimerRef.current = null
          if (manualFocusRef.current) syncAutomaticFocus()
        }, remaining + 20)
        return
      }
      syncAutomaticFocus()
    }

    window.addEventListener('scroll', resumeAutomaticFocus, { passive: true })
    return () => {
      window.removeEventListener('scroll', resumeAutomaticFocus)
      window.cancelAnimationFrame(frame)
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [articleRef, passages])

  return {
    activePassageId,
    activeFocusId,
    focusPassage,
  }
}
