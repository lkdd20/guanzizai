'use client'

import OpenCC from 'opencc-js'

export type AppLocale = 'zh-Hans' | 'zh-Hant'

export const localeStorageKey = 'guanzizai:locale'
export const localeChangeEvent = 'guanzizai:localechange'

export const localeOptions: Array<{
  value: AppLocale
  label: string
  shortLabel: string
  description: string
}> = [
  {
    value: 'zh-Hans',
    label: '简体中文',
    shortLabel: '简',
    description: '中国大陆、新加坡等简体环境',
  },
  {
    value: 'zh-Hant',
    label: '繁體中文',
    shortLabel: '繁',
    description: '臺灣、香港、澳門等繁體環境',
  },
]

type TextRecord = {
  raw: string
  converted: string
}

type AttributeRecord = {
  raw: string
  converted: string
}

const textRecords = new WeakMap<Text, TextRecord>()
const attributeRecords = new WeakMap<Element, Map<string, AttributeRecord>>()
const toHans = OpenCC.Converter({ from: 'tw', to: 'cn' })
const toHant = OpenCC.Converter({ from: 'cn', to: 'tw' })
const chinesePattern = /[\u3400-\u9fff]/
const ignoredTags = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'TEXTAREA',
])
const convertibleAttributes = ['placeholder', 'aria-label', 'title', 'alt']

let activeLocale: AppLocale | null = null
let observer: MutationObserver | null = null
let scheduledFrame = 0

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'zh-Hans' || value === 'zh-Hant'
}

export function localeFromLanguages(languages: readonly string[] = []): AppLocale {
  const normalized = languages.map((language) => language.toLowerCase())
  const wantsHant = normalized.some((language) => {
    return (
      language === 'zh-hant' ||
      language.startsWith('zh-hant-') ||
      language === 'zh-tw' ||
      language.startsWith('zh-tw-') ||
      language === 'zh-hk' ||
      language.startsWith('zh-hk-') ||
      language === 'zh-mo' ||
      language.startsWith('zh-mo-')
    )
  })
  return wantsHant ? 'zh-Hant' : 'zh-Hans'
}

export function resolveInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'zh-Hans'
  try {
    const stored = window.localStorage.getItem(localeStorageKey)
    if (isAppLocale(stored)) return stored
  } catch (err) {
    // Ignore storage failures and fall back to browser language.
  }
  const languages = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language].filter(Boolean)
  return localeFromLanguages(languages)
}

export function setLocalePreference(locale: AppLocale) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(localeStorageKey, locale)
  } catch (err) {
    // Private browsing or blocked storage should not break the switcher.
  }
  applyDocumentLocale(locale)
  window.dispatchEvent(new CustomEvent(localeChangeEvent, { detail: { locale } }))
}

export function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === 'undefined') return
  activeLocale = locale
  document.documentElement.lang = locale
  document.documentElement.dataset.locale = locale
  convertNodeTree(document.body, locale)
}

export function startLocaleRuntime(locale: AppLocale) {
  if (typeof document === 'undefined') return () => undefined
  applyDocumentLocale(locale)
  if (!observer) {
    observer = new MutationObserver(() => {
      scheduleLocaleApply()
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: convertibleAttributes,
      characterData: true,
      childList: true,
      subtree: true,
    })
  }
  return () => {
    if (scheduledFrame) {
      window.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = 0
    }
    observer?.disconnect()
    observer = null
  }
}

function scheduleLocaleApply() {
  if (!activeLocale || scheduledFrame || typeof window === 'undefined') return
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0
    if (activeLocale) applyDocumentLocale(activeLocale)
  })
}

function convertNodeTree(root: HTMLElement | null, locale: AppLocale) {
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT
      const textNode = node as Text
      if (!textNode.nodeValue || (!chinesePattern.test(textNode.nodeValue) && !textRecords.has(textNode))) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  textNodes.forEach((node) => convertTextNode(node, locale))

  root.querySelectorAll<Element>('*').forEach((element) => {
    if (shouldSkipAttributeElement(element)) return
    convertibleAttributes.forEach((attribute) => convertAttribute(element, attribute, locale))
  })
}

function convertTextNode(node: Text, locale: AppLocale) {
  const current = node.nodeValue ?? ''
  let record = textRecords.get(node)
  if (!record) {
    record = { raw: current, converted: current }
    textRecords.set(node, record)
  } else if (current !== record.converted) {
    record.raw = current
  }

  const converted = convertLocaleText(record.raw, locale)
  record.converted = converted
  if (current !== converted) node.nodeValue = converted
}

function convertAttribute(element: Element, attribute: string, locale: AppLocale) {
  const current = element.getAttribute(attribute)
  if (!current || (!chinesePattern.test(current) && !attributeRecords.has(element))) return
  let elementRecords = attributeRecords.get(element)
  if (!elementRecords) {
    elementRecords = new Map<string, AttributeRecord>()
    attributeRecords.set(element, elementRecords)
  }
  let record = elementRecords.get(attribute)
  if (!record) {
    record = { raw: current, converted: current }
    elementRecords.set(attribute, record)
  } else if (current !== record.converted) {
    record.raw = current
  }

  const converted = convertLocaleText(record.raw, locale)
  record.converted = converted
  if (current !== converted) element.setAttribute(attribute, converted)
}

export function convertLocaleText(text: string, locale: AppLocale) {
  if (!chinesePattern.test(text)) return text
  return locale === 'zh-Hant' ? toHant(text) : toHans(text)
}

function shouldSkipElement(element: Element) {
  if (ignoredTags.has(element.tagName)) return true
  return Boolean(element.closest('[data-locale-skip], .ignore-opencc'))
}

function shouldSkipAttributeElement(element: Element) {
  if (ignoredTags.has(element.tagName) && element.tagName !== 'TEXTAREA') return true
  return Boolean(element.closest('[data-locale-skip], .ignore-opencc'))
}
