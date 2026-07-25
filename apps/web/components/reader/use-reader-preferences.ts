'use client'

import { useEffect, useState } from 'react'

import { type ReaderMode } from '@/lib/content'
import {
  localeChangeEvent,
  resolveInitialLocale,
  setLocalePreference,
  type AppLocale,
} from '@/lib/locale'

export type ReaderWidth = 'normal' | 'wide'
export type ReaderTheme = 'light' | 'dark'
export type ReaderFont = 'readable' | 'classic'
export type ComparisonLayout = 'smart' | 'columns' | 'stacked'
export type WritingDirection = 'horizontal' | 'vertical'

export const defaultFontSize = 22
export const defaultLineHeight = 2
export const verticalDefaultLineHeight = 2.2
export const minFontSize = 18
export const maxFontSize = 32
export const minLineHeight = 1.6
export const maxLineHeight = 2.4

const settingsKey = 'guanzizai:reader-settings'
const comparisonLayoutPreferenceVersion = 2
const verticalTypographyPreferenceVersion = 1
const themeStorageKey = 'guanzizai:theme'
const validModes: ReaderMode[] = ['original', 'plain', 'parallel']
const fontSizeFromLegacy = { small: 20, default: defaultFontSize, large: 26 } as const
const lineHeightFromLegacy = { tight: 1.7, relaxed: defaultLineHeight, loose: 2.25 } as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readThemePreference(): ReaderTheme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyThemePreference(theme: ReaderTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(themeStorageKey, theme)
}

export function useReaderPreferences() {
  const [hydrated, setHydrated] = useState(false)
  const [mode, setMode] = useState<ReaderMode>('original')
  const [fontSize, setFontSize] = useState(defaultFontSize)
  const [lineHeight, setLineHeight] = useState(defaultLineHeight)
  const [font, setFont] = useState<ReaderFont>('readable')
  const [width, setWidth] = useState<ReaderWidth>('normal')
  const [comparisonLayout, setComparisonLayout] = useState<ComparisonLayout>('stacked')
  const [writingDirection, setWritingDirection] = useState<WritingDirection>('horizontal')
  const [pinyin, setPinyin] = useState(false)
  const [theme, setTheme] = useState<ReaderTheme>('light')
  const [locale, setLocaleState] = useState<AppLocale>('zh-Hans')

  useEffect(() => {
    setTheme(readThemePreference())
    setLocaleState(resolveInitialLocale())

    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<{ locale?: AppLocale }>).detail?.locale
      if (nextLocale === 'zh-Hans' || nextLocale === 'zh-Hant') setLocaleState(nextLocale)
    }

    window.addEventListener(localeChangeEvent, handleLocaleChange)
    try {
      const raw = localStorage.getItem(settingsKey)
      if (!raw) {
        setHydrated(true)
        return () => window.removeEventListener(localeChangeEvent, handleLocaleChange)
      }
      const parsed = JSON.parse(raw) as Partial<{
        mode: ReaderMode
        size: keyof typeof fontSizeFromLegacy
        line: keyof typeof lineHeightFromLegacy
        fontSize: number
        lineHeight: number
        font: ReaderFont
        width: ReaderWidth
        comparisonLayout: ComparisonLayout
        comparisonLayoutPreferenceVersion?: number
        verticalTypographyPreferenceVersion?: number
        writingDirection: WritingDirection
        pinyin: boolean
      }>
      if (parsed.mode && validModes.includes(parsed.mode)) setMode(parsed.mode)
      if (typeof parsed.fontSize === 'number') setFontSize(clamp(Math.round(parsed.fontSize), minFontSize, maxFontSize))
      else if (parsed.size && parsed.size in fontSizeFromLegacy) setFontSize(fontSizeFromLegacy[parsed.size])
      if (typeof parsed.lineHeight === 'number') {
        setLineHeight(clamp(Math.round(parsed.lineHeight * 10) / 10, minLineHeight, maxLineHeight))
      } else if (parsed.line && parsed.line in lineHeightFromLegacy) {
        setLineHeight(lineHeightFromLegacy[parsed.line])
      }
      if (parsed.font === 'readable' || parsed.font === 'classic') setFont(parsed.font)
      if (parsed.width === 'normal' || parsed.width === 'wide') setWidth(parsed.width)
      if (parsed.comparisonLayout === 'smart' || parsed.comparisonLayout === 'columns' || parsed.comparisonLayout === 'stacked') {
        setComparisonLayout(
          parsed.comparisonLayout === 'smart' && parsed.comparisonLayoutPreferenceVersion !== comparisonLayoutPreferenceVersion
            ? 'stacked'
            : parsed.comparisonLayout,
        )
      }
      if (parsed.writingDirection === 'horizontal' || parsed.writingDirection === 'vertical') {
        setWritingDirection(parsed.writingDirection)
        if (parsed.writingDirection === 'vertical'
          && parsed.verticalTypographyPreferenceVersion !== verticalTypographyPreferenceVersion) {
          setFont('classic')
          setLineHeight(verticalDefaultLineHeight)
        }
      }
      if (typeof parsed.pinyin === 'boolean') setPinyin(parsed.pinyin)
    } catch {
      try {
        localStorage.removeItem(settingsKey)
      } catch {
        // Reader defaults remain usable when storage is unavailable.
      }
    }
    setHydrated(true)
    return () => window.removeEventListener(localeChangeEvent, handleLocaleChange)
  }, [])

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify({ mode, fontSize, lineHeight, font, width, comparisonLayout, comparisonLayoutPreferenceVersion, verticalTypographyPreferenceVersion, writingDirection, pinyin }))
  }, [comparisonLayout, font, fontSize, lineHeight, mode, pinyin, width, writingDirection])

  function setWritingDirectionPreference(direction: WritingDirection) {
    setWritingDirection(direction)
    if (direction === 'vertical') {
      setFont('classic')
      setLineHeight(verticalDefaultLineHeight)
    }
  }

  function setThemePreferenceValue(themePreference: ReaderTheme) {
    applyThemePreference(themePreference)
    setTheme(themePreference)
  }

  function setLocale(localePreference: AppLocale) {
    setLocaleState(localePreference)
    setLocalePreference(localePreference)
  }

  return {
    hydrated,
    mode,
    setMode,
    fontSize,
    setFontSize,
    lineHeight,
    setLineHeight,
    font,
    setFont,
    width,
    setWidth,
    comparisonLayout,
    setComparisonLayout,
    writingDirection,
    setWritingDirection: setWritingDirectionPreference,
    pinyin,
    setPinyin,
    theme,
    setTheme: setThemePreferenceValue,
    locale,
    setLocale,
  }
}
