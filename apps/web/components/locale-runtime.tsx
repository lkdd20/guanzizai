'use client'

import { useEffect } from 'react'

import {
  applyDocumentLocale,
  isAppLocale,
  localeChangeEvent,
  localeStorageKey,
  resolveInitialLocale,
  startLocaleRuntime,
  type AppLocale,
} from '@/lib/locale'

export function LocaleRuntime() {
  useEffect(() => {
    let currentLocale = resolveInitialLocale()
    let stop: () => void = () => undefined
    let firstFrame = 0
    let secondFrame = 0
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        stop = startLocaleRuntime(currentLocale)
      })
    })

    function handleLocaleChange(event: Event) {
      const locale = (event as CustomEvent<{ locale?: AppLocale }>).detail?.locale
      if (isAppLocale(locale)) {
        currentLocale = locale
        applyDocumentLocale(locale)
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== localeStorageKey) return
      if (isAppLocale(event.newValue)) applyDocumentLocale(event.newValue)
    }

    function handlePageShow() {
      applyDocumentLocale(resolveInitialLocale())
    }

    window.addEventListener(localeChangeEvent, handleLocaleChange)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      stop()
      window.removeEventListener(localeChangeEvent, handleLocaleChange)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return null
}
