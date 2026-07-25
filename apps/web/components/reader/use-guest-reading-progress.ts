'use client'

import { useEffect, useRef, useState } from 'react'

import { type ReaderMode, type SutraPassage } from '@/lib/content'
import { loadClientReaderLibrary } from '@/lib/client-reader-library'
import {
  findReadingProgress,
  parseReadingProgress,
  readingProgressStorageKey,
  type ReadingProgressRecord,
  upsertReadingProgress,
} from '@/lib/reading-progress'

interface UseGuestReadingProgressOptions {
  workId: string
  contentVersion: string
  activePassage?: SutraPassage
  currentStartSequence?: number
  readerMode: ReaderMode
  writingDirection: 'horizontal' | 'vertical'
  authenticated: boolean
  totalPassages: number
  progressRatio: number
}

const deviceStorageKey = 'guanzizai:reader-device:v1'
const saveDelayMs = 1600

function readerDeviceId() {
  const stored = window.localStorage.getItem(deviceStorageKey)
  if (stored) return stored
  const value = window.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(deviceStorageKey, value)
  return value
}

export function useGuestReadingProgress({
  workId,
  contentVersion,
  activePassage,
  currentStartSequence,
  readerMode,
  writingDirection,
  authenticated,
  totalPassages,
  progressRatio,
}: UseGuestReadingProgressOptions) {
  const [resumeCandidate, setResumeCandidate] = useState<ReadingProgressRecord | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const latestProgressRef = useRef<ReadingProgressRecord | null>(null)
  const deviceIdRef = useRef('')

  useEffect(() => {
    const records = parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey))
    deviceIdRef.current = readerDeviceId()
    const existing = findReadingProgress(records, workId, contentVersion)
    const alreadyAtSavedPosition = existing?.sequence === currentStartSequence
      || existing?.passageId === activePassage?.id
    if (existing && existing.sequence > 1 && !alreadyAtSavedPosition) setResumeCandidate(existing)
    setStorageReady(true)
  }, [contentVersion, workId])

  useEffect(() => {
    if (!authenticated || !storageReady) return undefined
    let active = true
    void loadClientReaderLibrary(workId)
      .then((payload) => {
        if (!active) return
        const remote = payload.progress
        if (!remote || remote.contentVersion !== contentVersion) return
        const local = findReadingProgress(
          parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey)),
          workId,
          contentVersion,
        )
        if (!local || Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) {
          const records = parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey))
          window.localStorage.setItem(readingProgressStorageKey, JSON.stringify(upsertReadingProgress(records, remote)))
          const alreadyAtRemote = remote.sequence === currentStartSequence || remote.passageId === activePassage?.id
          if (remote.sequence > 1 && !alreadyAtRemote) setResumeCandidate(remote)
          return
        }
        if (Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) void saveRemoteProgress(local)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [authenticated, contentVersion, storageReady, workId])

  useEffect(() => {
    if (!storageReady || resumeCandidate || !activePassage) return undefined
    const progress: ReadingProgressRecord = {
      workId,
      contentVersion,
      passageId: activePassage.id,
      sequence: activePassage.seq,
      readerMode,
      writingDirection,
      intraPassageRatio: 0,
      deviceId: deviceIdRef.current || readerDeviceId(),
      updatedAt: new Date().toISOString(),
      totalPassages,
      progressRatio,
    }
    latestProgressRef.current = progress
    const timer = window.setTimeout(() => {
      const records = parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey))
      window.localStorage.setItem(
        readingProgressStorageKey,
        JSON.stringify(upsertReadingProgress(records, progress)),
      )
      if (authenticated) void saveRemoteProgress(progress)
    }, saveDelayMs)
    return () => window.clearTimeout(timer)
  }, [activePassage, authenticated, contentVersion, progressRatio, readerMode, resumeCandidate, storageReady, totalPassages, workId, writingDirection])

  useEffect(() => {
    function saveBeforeLeaving() {
      if (!storageReady || resumeCandidate || !latestProgressRef.current) return
      const records = parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey))
      window.localStorage.setItem(
        readingProgressStorageKey,
        JSON.stringify(upsertReadingProgress(records, latestProgressRef.current)),
      )
    }
    window.addEventListener('pagehide', saveBeforeLeaving)
    return () => window.removeEventListener('pagehide', saveBeforeLeaving)
  }, [resumeCandidate, storageReady])

  function resolveResume() {
    setResumeCandidate(null)
  }

  function saveRemoteProgress(progress: ReadingProgressRecord) {
    return fetch('/api/me/reading-progress', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(progress),
      keepalive: true,
    }).catch(() => undefined)
  }

  return { resumeCandidate, resolveResume }
}
