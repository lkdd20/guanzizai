'use client'

import Link from 'next/link'
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  FileText,
  FilePenLine,
  House,
  History,
  LibraryBig,
  Languages,
  LocateFixed,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Send,
  ShieldCheck,
  ScrollText,
  Sun,
  Text,
  UserRound,
} from 'lucide-react'
import { type CSSProperties, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { LanguageToggle } from '@/components/language-toggle'
import { ReaderExportSheet } from '@/components/reader-export-sheet'
import {
  type ComparisonLayout,
  defaultFontSize,
  defaultLineHeight,
  maxFontSize,
  maxLineHeight,
  minFontSize,
  minLineHeight,
  verticalDefaultLineHeight,
  useReaderPreferences,
} from '@/components/reader/use-reader-preferences'
import { usePaginatedWork } from '@/components/reader/use-paginated-work'
import { useReadingFocus } from '@/components/reader/use-reading-focus'
import { useGuestReadingProgress } from '@/components/reader/use-guest-reading-progress'
import { ReaderSelectionToolbar, useReaderLibrary } from '@/components/reader/use-reader-library'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type ReaderMode,
  type PassageEnrichment,
  type PassageReadingNote,
  type SutraPassage,
  type SutraRecord,
  type TermDefinition,
  passageNumber,
  sutraStats,
} from '@/lib/content'
import { type AppLocale, convertLocaleText } from '@/lib/locale'
import { loadClientAuthSession, type ClientAuthSession } from '@/lib/client-auth-session'
import { sourceVerificationNotice } from '@/lib/source-verification'
import { cleanReaderText } from '@/lib/reader-text'
import { isHanCharacter, pinyinUnits } from '@/lib/reader-pinyin'
import { getReaderCache, putReaderCache } from '@/lib/reader-cache'
import { centeredOutlineScrollTop, currentOutlineItemKey } from '@/lib/reader-pagination'
import { estimateVerticalFrameDimensions, groupContinuousVerticalItems, verticalCanvasLayout } from '@/lib/reader-vertical-layout'
import { cn } from '@/lib/utils'

type TocView = 'contents' | 'volumes'

interface ReaderShellProps {
  sutra: SutraRecord
  terms: TermDefinition[]
  startSequence?: number
}

interface ActiveTerm extends TermDefinition {
  x: number
  y: number
}

const directoryKey = 'guanzizai:reader-directory'
const desktopDirectoryKey = `${directoryKey}:desktop`
const mobileDirectoryKey = `${directoryKey}:mobile`
const directoryDrawerQuery = '(max-width: 1300px)'
const termHoverDelay = 560
const termCloseDelay = 240
const resumePromptAutoDismissMs = 8000
const enrichmentPageCache = new Map<string, Promise<{ enrichments: Array<{ passageId: string; enrichment: PassageEnrichment }> }>>()

const modes: Array<{ value: ReaderMode; label: string; description: string }> = [
  { value: 'original', label: '仅原文', description: '默认阅读模式' },
  { value: 'plain', label: '白话辅助', description: '隐藏原文阅读，内容仍以原文为准' },
  { value: 'parallel', label: '分节对照', description: '原文与白话上下分节' },
]

const comparisonLayouts: Array<{ value: ComparisonLayout; label: string }> = [
  { value: 'stacked', label: '上下' },
  { value: 'columns', label: '左右' },
  { value: 'smart', label: '智能' },
]

const pinyinByCharacter: Record<string, string> = {
  一: 'yī',
  三: 'sān',
  上: 'shàng',
  不: 'bù',
  世: 'shì',
  中: 'zhōng',
  乃: 'nǎi',
  五: 'wǔ',
  亦: 'yì',
  以: 'yǐ',
  佛: 'fó',
  依: 'yī',
  倒: 'dǎo',
  僧: 'sēng',
  切: 'qiè',
  利: 'lì',
  即: 'jí',
  厄: 'è',
  受: 'shòu',
  味: 'wèi',
  咒: 'zhòu',
  在: 'zài',
  垢: 'gòu',
  埵: 'duǒ',
  增: 'zēng',
  多: 'duō',
  夢: 'mèng',
  大: 'dà',
  如: 'rú',
  婆: 'pó',
  子: 'zǐ',
  實: 'shí',
  度: 'dù',
  得: 'dé',
  復: 'fù',
  心: 'xīn',
  怖: 'bù',
  恐: 'kǒng',
  想: 'xiǎng',
  意: 'yì',
  所: 'suǒ',
  提: 'tí',
  揭: 'jiē',
  故: 'gù',
  明: 'míng',
  是: 'shì',
  時: 'shí',
  智: 'zhì',
  曰: 'yuē',
  有: 'yǒu',
  槃: 'pán',
  死: 'sǐ',
  法: 'fǎ',
  波: 'bō',
  涅: 'niè',
  淨: 'jìng',
  深: 'shēn',
  減: 'jiǎn',
  滅: 'miè',
  無: 'wú',
  照: 'zhào',
  生: 'shēng',
  界: 'jiè',
  異: 'yì',
  皆: 'jiē',
  盡: 'jìn',
  相: 'xiàng',
  真: 'zhēn',
  眼: 'yǎn',
  知: 'zhī',
  礙: 'ài',
  神: 'shén',
  究: 'jiū',
  空: 'kōng',
  竟: 'jìng',
  等: 'děng',
  罣: 'guà',
  羅: 'luó',
  老: 'lǎo',
  耨: 'nòu',
  耳: 'ěr',
  聲: 'shēng',
  能: 'néng',
  自: 'zì',
  至: 'zhì',
  舌: 'shé',
  舍: 'shè',
  般: 'bō',
  色: 'sè',
  若: 'rě',
  苦: 'kǔ',
  菩: 'pú',
  薩: 'sà',
  藐: 'miǎo',
  蘊: 'yùn',
  虛: 'xū',
  蜜: 'mì',
  行: 'xíng',
  見: 'jiàn',
  觀: 'guān',
  觸: 'chù',
  訶: 'hē',
  說: 'shuō',
  諦: 'dì',
  諸: 'zhū',
  識: 'shí',
  身: 'shēn',
  道: 'dào',
  遠: 'yuǎn',
  阿: 'ā',
  除: 'chú',
  集: 'jí',
  離: 'lí',
  顛: 'diān',
  香: 'xiāng',
  鼻: 'bí',
}

function termMap(terms: TermDefinition[]) {
  return new Map(terms.map((term) => [term.term, term]))
}

function noteStatusLabel(note: PassageReadingNote) {
  if (note.confidence?.includes('reviewed_generic_definition')) return '通用释义'
  if (note.source === 'wikisource_footnote') return '来源页注释'
  return '待复核'
}

function noteDefinition(note: PassageReadingNote, term: string): TermDefinition {
  const status = noteStatusLabel(note)
  const confidence = status === '通用释义'
    ? '通用释义，辅助理解当前语境'
    : status === '来源页注释' ? '来源页注释，尚待复核' : '阅读辅助，尚待复核'
  return { term, summary: note.explanation, note: confidence, sanskrit: note.pinyin }
}

interface ReadingMaterialsProps {
  passage: SutraPassage
  locale: AppLocale
  onRequestEnrichment: (passages: SutraPassage[]) => Promise<void>
}

function passageReadingNotes(passage: SutraPassage) {
  return passage.readingNotes?.length ? passage.readingNotes : passage.enrichment?.readingNotes ?? []
}

function hasReadingMaterials(passage: SutraPassage) {
  return passageReadingNotes(passage).length > 0
}

const ReadingMaterials = memo(function ReadingMaterials({ passage, locale, onRequestEnrichment }: ReadingMaterialsProps) {
  const [open, setOpen] = useState(false)
  if (!passage.enrichmentAvailable) return null

  const enrichment = passage.enrichment
  const readingNotes = passageReadingNotes(passage)
  const keywords = passage.keywords?.length ? passage.keywords : enrichment?.keywords ?? []
  const noteStatuses = [...new Set(readingNotes.map(noteStatusLabel))]
  const materialCounts = [`${readingNotes.length} 条注释`, keywords.length ? `${keywords.length} 个主题` : ''].filter(Boolean).join(' · ')
  if (!readingNotes.length) return null

  return (
    <div className="read-passage-materials" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="read-materials-summary"
        aria-expanded={open}
        aria-controls={`${passage.id}-materials-content`}
        onClick={() => {
          if (!open) void onRequestEnrichment([passage])
          setOpen((value) => !value)
        }}
      >
        <span className="read-materials-summary-title"><BookOpen aria-hidden="true" />阅读资料</span>
        <span className="read-materials-summary-actions">
          <small>{materialCounts}</small>
          <span className="read-materials-toggle" aria-hidden="true">
            {open ? <Minus /> : <Plus />}
          </span>
        </span>
      </button>
      <div className="read-materials-body-clip" id={`${passage.id}-materials-content`} data-open={open ? 'true' : 'false'}>
        <div className="read-materials-body">
          {readingNotes.length ? (
            <section>
              <h3 className="read-materials-heading">
                <span>难词与文化词</span>
                <span className="read-materials-status-list" aria-label="注释状态">
                  {noteStatuses.map((status) => <span className="read-materials-status" key={status}>{status}</span>)}
                </span>
              </h3>
              <dl className="read-note-list">
                {readingNotes.map((note, index) => (
                  <div key={`${passage.id}-note-${note.termTraditional}-${index}`}>
                    <dt>{locale === 'zh-Hans' ? note.termSimplified || note.termTraditional : note.termTraditional || note.termSimplified}{note.pinyin ? <small>{note.pinyin}</small> : null}</dt>
                    <dd>{note.explanation}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {keywords.length ? (
            <section>
              <h3>本段主题</h3>
              <p className="read-materials-section-note">用于概览与检索，不对应正文具体位置。</p>
              <div className="read-keyword-list">{keywords.map((keyword) => <span key={`${passage.id}-${keyword}`}>{keyword}</span>)}</div>
            </section>
          ) : null}
          {enrichment ? <section className="read-materials-source">
            <h3>版本记录</h3>
            <p><span>修订号 {enrichment.sourceRevisionId}</span><code title={enrichment.sourceRecordHash}>SHA-256 {enrichment.sourceRecordHash.slice(0, 16)}…</code></p>
            <p>{enrichment.sourceLicense}</p>
            <a href={enrichment.sourceUrl} target="_blank" rel="noreferrer">查看来源页面</a>
          </section> : <p className="read-materials-loading">版本信息正在后台载入…</p>}
        </div>
      </div>
    </div>
  )
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function groupCompactPassages(passages: SutraPassage[]) {
  const groups: SutraPassage[][] = []
  let current: SutraPassage[] = []
  let characterCount = 0

  passages.forEach((passage) => {
    current.push(passage)
    characterCount += passage.original.length
    if (current.length >= 4 || characterCount >= 96) {
      groups.push(current)
      current = []
      characterCount = 0
    }
  })
  if (current.length) groups.push(current)
  return groups
}

function positionFromRect(rect: DOMRect) {
  const width = 320
  const height = 180
  const margin = 16
  let x = rect.right + 14
  if (x + width > window.innerWidth - margin) x = rect.left - width - 14
  if (x < margin) x = rect.left + rect.width / 2 - width / 2
  x = Math.max(margin, Math.min(x, window.innerWidth - width - margin))
  let y = rect.top + rect.height / 2 - height / 2
  y = Math.max(margin, Math.min(y, window.innerHeight - height - margin))
  return { x, y }
}

interface PinyinCursor {
  index: number
  units: Array<string | null>
}

function renderReaderText(text: string, keyPrefix: string, cursor: PinyinCursor, showPinyin: boolean) {
  return Array.from(text).map((character, index) => {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint >= 0xe000 && codePoint <= 0xf8ff) {
      return (
        <span
          className="read-missing-glyph"
          key={`${keyPrefix}-${index}-missing-${codePoint}`}
          title={`来源底本使用私用区占位符 U+${codePoint.toString(16).toUpperCase()}，原字形未提供`}
          aria-label="底本缺字"
        >
          □
        </span>
      )
    }
    if (!isHanCharacter(character)) return character
    if (!showPinyin) return character
    const datasetPinyin = cursor.units[cursor.index]
    cursor.index += 1
    const pinyin = datasetPinyin ?? pinyinByCharacter[character]
    return (
      <ruby className="read-ruby" key={`${keyPrefix}-${index}-${character}`}>
        {character}
        <rt title={pinyin ? undefined : '读音待核'}>{pinyin ?? '·'}</rt>
      </ruby>
    )
  })
}

function readingParagraphs(text: string) {
  const output: string[] = []
  for (const sourceLine of text.split('\n')) {
    let line = sourceLine.trim()
    if (!line) continue
    const volumeHeading = line.match(/^(\S*卷[一二三四五六七八九十百廿卅〇零]+\S*)\s+(.+)$/u)
    if (volumeHeading) {
      output.push(volumeHeading[1])
      const remainder = volumeHeading[2].trim()
      if (remainder.length > 180 && !/[。！？；：]/u.test(remainder)) continue
      line = remainder
    }
    if (line.length <= 180) {
      output.push(line)
      continue
    }
    const sentences = line.match(/[^。！？；]+[。！？；]+[”’」』]?|[^。！？；]+$/gu) ?? [line]
    let paragraph = ''
    for (const sentence of sentences) {
      const startsCommentary = /^(异史氏曰|外史氏曰|纪昀曰)/u.test(sentence.trim())
      if (startsCommentary && paragraph) {
        output.push(paragraph)
        paragraph = ''
      }
      if (paragraph && paragraph.length + sentence.length > 180) {
        output.push(paragraph)
        paragraph = ''
      }
      paragraph += sentence
      if (paragraph.length >= 110) {
        output.push(paragraph)
        paragraph = ''
      }
    }
    if (paragraph) output.push(paragraph)
  }
  return output
}

function isDisplayHeading(text: string) {
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.length <= 24 && !/[。！？；：”’」』]$/u.test(trimmed)
}

function isStructuredReadingHeading(text: string) {
  const source = text.trim()
  const cleaned = cleanReaderText(source).trim().replace(/^;/u, '')
  if (source.startsWith(';')) return true
  if (!isDisplayHeading(cleaned)) return false
  return /(?:序|跋|正文|篇第[一二三四五六七八九十百千0-9]+|第[一二三四五六七八九十百千0-9]+篇|卷[一二三四五六七八九十百千0-9]+)$/u.test(cleaned)
}

function readingVersePhrases(text: string) {
  if (/[。！？；：，、,.!?]/u.test(text)) return []
  const phrases = text.trim().split(/\s+/u).filter(Boolean)
  if (phrases.length < 4) return []
  return phrases.every((phrase) => {
    const hanCharacters = phrase.match(/\p{Script=Han}/gu)?.length ?? 0
    return hanCharacters >= 2 && hanCharacters <= 10
  }) ? phrases : []
}

function headingAnchor(passageId: string, index: number) {
  return `${passageId}-title-${index}`
}

function readingLineAnchor(passageId: string, index: number, heading: boolean) {
  return heading ? headingAnchor(passageId, index) : `${passageId}-line-${index}`
}

function contributorLine(sutra: SutraRecord) {
  return `${sutra.dynasty} · ${sutra.translator}`
}

export function ReaderShell({ sutra, terms, startSequence }: ReaderShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [directoryScope, setDirectoryScope] = useState<'desktop' | 'mobile'>('desktop')
  const [activeTerm, setActiveTerm] = useState<ActiveTerm | null>(null)
  const [pairedTarget, setPairedTarget] = useState('')
  const [translationReturnTarget, setTranslationReturnTarget] = useState<{ id: string; pairKey: string; passageAnchor: string } | null>(null)
  const [pairHintVisible, setPairHintVisible] = useState(false)
  const [session, setSession] = useState<ClientAuthSession>({ authenticated: false, user: null })
  const [contributionOpen, setContributionOpen] = useState(false)
  const [contributionPassageId, setContributionPassageId] = useState(sutra.passages[0]?.id ?? '')
  const [contributionState, setContributionState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [contributionText, setContributionText] = useState('')
  const [contributionSourceType, setContributionSourceType] = useState<'original' | 'licensed' | 'other'>('original')
  const [tocView, setTocView] = useState<TocView>('contents')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadPreviousRef = useRef<HTMLDivElement | null>(null)
  const tocOutlineRef = useRef<HTMLDivElement | null>(null)
  const readArticleRef = useRef<HTMLElement | null>(null)
  const aboutModeRef = useRef(false)
  const enrichmentRequestedRef = useRef(new Set<string>())
  const pairedTargetTimerRef = useRef<number | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const settings = useReaderPreferences()
  const {
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
    hasPreviousPassages,
    prefetchSection,
    prefetchAdjacentSections,
    cancelSectionLoad,
    cancelLoadMore,
  } = usePaginatedWork({ sutra, startSequence })
  const {
    activePassageId: activeAnchor,
    activeFocusId: activeReadingLine,
    focusPassage,
  } = useReadingFocus({
    articleRef: readArticleRef,
    passages: loadedPassages,
    initialPassageId: sutra.passages[0]?.anchorId ?? 'read-text',
  })
  const definitions = useMemo(() => termMap(terms), [terms])
  const modeLabel = modes.find((item) => item.value === settings.mode)?.label ?? '仅原文'
  const visibleSutra = useMemo(() => ({ ...sutra, passages: loadedPassages }), [sutra, loadedPassages])
  const stats = useMemo(() => sutraStats(visibleSutra), [visibleSutra])
  const readingDensity = sutra.paginated
    || (sutra.passageCount ?? sutra.passages.length) > 24
    || stats.originalCharCount > 4000
    ? 'long'
    : 'standard'
  const verticalLayout = verticalCanvasLayout(stats.originalCharCount, Boolean(sutra.paginated))
  const continuousVerticalFlow = settings.writingDirection === 'vertical'
    && (settings.mode === 'original' || settings.mode === 'parallel')
    && loadedPassages.length > 1
  const compactVerticalEligible = settings.writingDirection === 'vertical'
    && verticalLayout === 'compact'
    && loadedPassages.length > 1
    && loadedPassages.every((passage) => !passage.original.includes('\n') && passage.original.length <= 300)
  const compactVerticalParallel = compactVerticalEligible && settings.mode === 'parallel'
  const continuousVerticalGroups = useMemo(
    () => continuousVerticalFlow ? groupContinuousVerticalItems(loadedPassages, visibleOriginal, 720, 16, (passage) => passage.juan) : [],
    [continuousVerticalFlow, loadedPassages, settings.locale],
  )
  const compactParallelGroups = useMemo(
    () => compactVerticalParallel ? groupCompactPassages(loadedPassages) : [],
    [compactVerticalParallel, loadedPassages],
  )
  const totalPassages = sutra.passageCount ?? sutra.passages.length
  const readingStartSequence = Math.max(0, (outline[0]?.sequence ?? sutra.passages[0]?.seq ?? 1) - 1)
  const activePassage = loadedPassages.find((passage) => passage.anchorId === activeAnchor)
  const activeSequence = activePassage?.seq
    ?? currentStartSequence
    ?? loadedPassages[0]?.seq
    ?? readingStartSequence
  const progressSequence = pendingStartSequence ?? activeSequence
  const bookProgress = clamp((progressSequence - readingStartSequence) / Math.max(1, totalPassages), 0, 1)
  const sourceVerification = sourceVerificationNotice(sutra.sourceVerification)
  const readArticleStyle = {
    '--reader-size': `${settings.fontSize}px`,
    '--reader-line': settings.lineHeight,
    '--reader-font': settings.font === 'classic' ? 'var(--font-reader-classic)' : 'var(--font-reader-readable)',
  } as CSSProperties
  const localizedTitle = convertLocaleText(sutra.title, settings.locale)
  const localizedShortTitle = convertLocaleText(sutra.shortTitle, settings.locale)
  const localizedContributor = convertLocaleText(contributorLine(sutra), settings.locale)
  const localizedOverview = convertLocaleText(sutra.overview.summary, settings.locale)
  const localizedDescription = convertLocaleText(sutra.description, settings.locale)
  const contributors = [...new Set(loadedPassages.map((passage) => passage.translationContributor).filter(Boolean))] as string[]
  const { resumeCandidate, resolveResume } = useGuestReadingProgress({
    workId: sutra.id,
    contentVersion,
    activePassage,
    currentStartSequence,
    readerMode: settings.mode,
    writingDirection: settings.writingDirection,
    authenticated: session.authenticated,
    totalPassages,
    progressRatio: bookProgress,
  })
  const readerLibrary = useReaderLibrary({
    articleRef: readArticleRef,
    sutra,
    contentVersion,
    passages: loadedPassages,
    activePassage,
    authenticated: session.authenticated,
    progressRatio: bookProgress,
  })

  useEffect(() => {
    const encodedHash = window.location.hash.slice(1)
    if (!encodedHash) return undefined
    let targetId = encodedHash
    try {
      targetId = decodeURIComponent(encodedHash)
    } catch {
      return undefined
    }
    const passage = loadedPassages.find((item) => item.anchorId === targetId)
    if (!passage) return undefined
    let cancelled = false
    const alignTarget = () => {
      if (cancelled) return
      const target = document.getElementById(targetId)
      if (!target) return
      focusPassage(passage.anchorId)
      target.scrollIntoView({ block: 'start' })
    }
    const frame = window.requestAnimationFrame(alignTarget)
    const timers = [250, 750, 1500].map((delay) => window.setTimeout(alignTarget, delay))
    void document.fonts.ready.then(() => window.requestAnimationFrame(alignTarget))
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [loadedPassages])

  useEffect(() => {
    if (!resumeCandidate) return undefined
    if (window.location.hash) {
      resolveResume()
      return undefined
    }
    const timer = window.setTimeout(resolveResume, resumePromptAutoDismissMs)
    return () => window.clearTimeout(timer)
  }, [resumeCandidate])

  const volumeEntries = useMemo(() => outline.filter((item) => item.kind === 'volume'), [outline])
  const contentEntries = useMemo(
    () => outline.filter((item) => item.kind === 'chapter' || item.kind === 'section'),
    [outline],
  )
  const fallbackEntries = useMemo(() => outline.filter((item) => item.kind === 'body'), [outline])
  const hasDualToc = volumeEntries.length > 0 && contentEntries.length > 0
  const visibleOutline = tocView === 'volumes' && volumeEntries.length
    ? volumeEntries
    : contentEntries.length ? contentEntries : volumeEntries.length ? volumeEntries : fallbackEntries
  const currentOutlineKey = currentOutlineItemKey(
    visibleOutline,
    pendingStartSequence ?? currentStartSequence ?? activeSequence,
  )

  useEffect(() => {
    const container = tocOutlineRef.current
    if (!sidebarOpen || !container || !currentOutlineKey) return undefined
    const frame = window.requestAnimationFrame(() => {
      const current = container.querySelector<HTMLElement>('a[aria-current="page"]')
      if (!current) return
      const containerRect = container.getBoundingClientRect()
      const currentRect = current.getBoundingClientRect()
      const centeredTop = centeredOutlineScrollTop({
        containerHeight: container.clientHeight,
        containerScrollTop: container.scrollTop,
        containerTop: containerRect.top,
        itemHeight: currentRect.height,
        itemTop: currentRect.top,
      })
      container.scrollTo({ top: centeredTop, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentOutlineKey, sidebarOpen, tocView])

  const ensurePassageEnrichments = useCallback(async (passages: SutraPassage[]) => {
    const pending = passages.filter((passage) => (
      passage.enrichmentAvailable && !passage.enrichment && !enrichmentRequestedRef.current.has(passage.id)
    ))
    if (!pending.length) return
    pending.forEach((passage) => enrichmentRequestedRef.current.add(passage.id))
    const ids = pending.map((passage) => passage.id).sort()
    const cacheKey = `${sutra.id}:${contentVersion}:${ids.join(',')}`
    let request = enrichmentPageCache.get(cacheKey)
    if (!request) {
      const params = new URLSearchParams({ v: contentVersion })
      ids.forEach((id) => params.append('passageId', id))
      request = getReaderCache<{ enrichments: Array<{ passageId: string; enrichment: PassageEnrichment }> }>(`enrichment:${cacheKey}`)
        .then(async (cached) => {
          if (cached) return cached
          const response = await fetch(`/api/content/works/${encodeURIComponent(sutra.id)}/enrichments?${params.toString()}`)
          if (!response.ok) throw new Error('enrichment_load_failed')
          const payload = await response.json() as { enrichments: Array<{ passageId: string; enrichment: PassageEnrichment }> }
          void putReaderCache(`enrichment:${cacheKey}`, payload)
          return payload
        })
        .catch((error) => {
          enrichmentPageCache.delete(cacheKey)
          throw error
        })
      enrichmentPageCache.set(cacheKey, request)
    }
    try {
      const payload = await request
      const byPassage = new Map(payload.enrichments.map((item) => [item.passageId, item.enrichment]))
      setLoadedPassages((current) => current.map((passage) => {
        const enrichment = byPassage.get(passage.id)
        return enrichment ? { ...passage, enrichment } : passage
      }))
    } catch {
      pending.forEach((passage) => enrichmentRequestedRef.current.delete(passage.id))
    }
  }, [contentVersion, sutra.id])

  useEffect(() => {
    let active = true
    void loadClientAuthSession().then((payload) => {
      if (active) setSession(payload)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const active = loadedPassages.find((passage) => passage.anchorId === activeAnchor)
    if (active) void ensurePassageEnrichments([active])
  }, [activeAnchor, loadedPassages])

  useEffect(() => {
    const priority = loadedPassages.slice(0, 3)
    const remainder = loadedPassages.slice(3)
    void ensurePassageEnrichments(priority)
    if (!remainder.length) return undefined
    const timer = window.setTimeout(() => void ensurePassageEnrichments(remainder), 120)
    return () => window.clearTimeout(timer)
  }, [loadedPassages])

  useEffect(() => () => {
    if (pairedTargetTimerRef.current) window.clearTimeout(pairedTargetTimerRef.current)
  }, [])

  useEffect(() => {
    const active = loadedPassages.find((passage) => passage.anchorId === activeAnchor)
    if (active) setContributionPassageId(active.id)
  }, [activeAnchor, loadedPassages])

  async function submitContribution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session.authenticated) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    setContributionState('sending')
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/content/works/${encodeURIComponent(sutra.id)}/translations/contributions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        passageId: contributionPassageId,
        contributorName: form.get('contributorName'),
        translation: form.get('translation'),
        sourceType: form.get('sourceType'),
        sourceName: form.get('sourceName'),
        sourceUrl: form.get('sourceUrl'),
        licenseNote: form.get('licenseNote'),
      }),
    })
    setContributionState(response.ok ? 'sent' : 'error')
    if (response.ok) {
      event.currentTarget.reset()
      setContributionText('')
      setContributionSourceType('original')
    }
  }

  function chooseReaderMode(mode: ReaderMode) {
    settings.setMode(mode)
  }

  async function loadSection(sequence: number, updateHistory = true) {
    if (!sutra.paginated || sequence === currentStartSequence) return
    aboutModeRef.current = false
    setActiveTerm(null)
    setTranslationReturnTarget(null)
    setPairHintVisible(false)
    try {
      const payload = await loadSectionData(sequence)
      if (!payload) return
      const target = payload.passages.find((passage) => passage.seq === sequence) ?? payload.passages[0]
      focusPassage(target.anchorId)
      if (updateHistory) window.history.pushState({ startSequence: sequence }, '', `/read/${sutra.id}?start=${sequence}`)
      window.requestAnimationFrame(() => {
        document.getElementById(target.anchorId)?.scrollIntoView({ block: 'start' })
      })
      if (directoryScope === 'mobile') setSidebarOpen(false)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        window.location.assign(`/read/${sutra.id}?start=${sequence}`)
      }
    }
  }

  useEffect(() => {
    const media = window.matchMedia(directoryDrawerQuery)

    function syncDirectoryState() {
      const scope = media.matches ? 'mobile' : 'desktop'
      const storageKey = scope === 'mobile' ? mobileDirectoryKey : desktopDirectoryKey
      const stored = localStorage.getItem(storageKey) ?? (scope === 'desktop' ? localStorage.getItem(directoryKey) : null)
      setDirectoryScope(scope)
      if (stored === 'closed') {
        setSidebarOpen(false)
        return
      }
      if (stored === 'open') {
        setSidebarOpen(true)
        return
      }
      setSidebarOpen(scope === 'desktop')
    }

    syncDirectoryState()
    media.addEventListener('change', syncDirectoryState)
    return () => media.removeEventListener('change', syncDirectoryState)
  }, [])

  useEffect(() => {
    function restoreSection() {
      const value = Number(new URL(window.location.href).searchParams.get('start'))
      if (Number.isFinite(value) && value > 0 && value !== currentStartSequence) void loadSection(value, false)
    }
    window.addEventListener('popstate', restoreSection)
    return () => {
      window.removeEventListener('popstate', restoreSection)
      cancelSectionLoad()
    }
  }, [currentStartSequence])

  useEffect(() => {
    if (!sutra.paginated || !currentStartSequence) return undefined
    const timer = window.setTimeout(() => prefetchAdjacentSections(currentStartSequence), 400)
    return () => window.clearTimeout(timer)
  }, [currentStartSequence, sutra.paginated])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMorePassages || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(async (entries) => {
      if (aboutModeRef.current || !entries.some((entry) => entry.isIntersecting) || loadingMore) return
      try {
        if (!aboutModeRef.current) await loadMorePassages()
      } catch (error) {
        if ((error as Error).name !== 'AbortError') return
      }
    }, { rootMargin: '1200px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [contentVersion, hasMorePassages, loadedPassages, loadingMore, sutra.id])

  useEffect(() => {
    const target = loadPreviousRef.current
    if (!target || !hasPreviousPassages || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(async (entries) => {
      if (aboutModeRef.current || !entries.some((entry) => entry.isIntersecting) || loadingPrevious) return
      try {
        await loadPreviousPassages()
      } catch (error) {
        if ((error as Error).name !== 'AbortError') return
      }
    }, { rootMargin: '900px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [contentVersion, hasPreviousPassages, loadedPassages, loadingPrevious, sutra.id])

  useEffect(() => {
    const article = readArticleRef.current
    if (!article || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) aboutModeRef.current = false
    }, { threshold: 0.02 })
    observer.observe(article)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const storageKey = directoryScope === 'mobile' ? mobileDirectoryKey : desktopDirectoryKey
    localStorage.setItem(storageKey, sidebarOpen ? 'open' : 'closed')
  }, [directoryScope, sidebarOpen])

  useEffect(() => {
    if (!readArticleRef.current) return undefined
    const articleElement: HTMLElement = readArticleRef.current
    let firstFrame = 0
    let measureFrame = 0
    let active = true

    function measureComparisonLayout() {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(measureFrame)
      const passages = Array.from(articleElement.querySelectorAll<HTMLElement>('.read-passage'))
      passages.forEach((passage) => delete passage.dataset.compareStack)
      if (settings.writingDirection === 'vertical' || settings.mode !== 'parallel' || settings.comparisonLayout !== 'smart' || window.matchMedia('(max-width: 980px)').matches) return

      firstFrame = window.requestAnimationFrame(() => {
        measureFrame = window.requestAnimationFrame(() => {
          if (!active) return
          passages.forEach((passage) => {
            const original = passage.querySelector<HTMLElement>('.read-original')
            const plain = passage.querySelector<HTMLElement>('.read-plain')
            if (!original || !plain) return
            const originalHeight = original.getBoundingClientRect().height
            const plainHeight = plain.getBoundingClientRect().height
            const shorter = Math.max(1, Math.min(originalHeight, plainHeight))
            const originalLength = original.textContent?.trim().length ?? 0
            const plainLength = plain.textContent?.trim().length ?? 0
            const shouldStack = Math.max(originalHeight, plainHeight) >= 520
              || Math.max(originalLength, plainLength) >= 360
              || Math.max(originalHeight, plainHeight) / shorter >= 1.8
              || Math.abs(originalHeight - plainHeight) >= 240
            if (shouldStack) passage.dataset.compareStack = 'true'
          })
        })
      })
    }

    measureComparisonLayout()
    window.addEventListener('resize', measureComparisonLayout)
    void document.fonts?.ready.then(() => {
      if (active) measureComparisonLayout()
    })
    return () => {
      active = false
      window.removeEventListener('resize', measureComparisonLayout)
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(measureFrame)
    }
  }, [loadedPassages, settings.comparisonLayout, settings.font, settings.fontSize, settings.lineHeight, settings.mode, settings.width, settings.writingDirection])

  useEffect(() => {
    const article = readArticleRef.current
    if (!article || settings.writingDirection !== 'vertical') return undefined
    const canvases = Array.from(article.querySelectorAll<HTMLElement>('.read-original, .read-plain'))
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scrollStates = new Map<HTMLElement, { target: number; frame: number | null }>()

    function wheelDistance(event: WheelEvent, canvas: HTMLElement) {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * canvas.clientWidth
      return event.deltaY
    }

    function animateColumns(canvas: HTMLElement, state: { target: number; frame: number | null }) {
      const max = Math.max(0, canvas.scrollWidth - canvas.clientWidth)
      state.target = clamp(state.target, -max, 0)
      const remaining = state.target - canvas.scrollLeft
      if (Math.abs(remaining) < 0.6) {
        canvas.scrollTo({ left: state.target, behavior: 'auto' })
        state.frame = null
        return
      }
      canvas.scrollTo({ left: canvas.scrollLeft + remaining * 0.17, behavior: 'auto' })
      state.frame = window.requestAnimationFrame(() => animateColumns(canvas, state))
    }

    function moveColumns(event: WheelEvent) {
      const canvas = event.currentTarget as HTMLElement
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || canvas.scrollWidth <= canvas.clientWidth) return
      const max = canvas.scrollWidth - canvas.clientWidth
      const existing = scrollStates.get(canvas)
      if (existing?.frame === null) existing.target = canvas.scrollLeft
      const intendedPosition = Math.abs(existing?.target ?? canvas.scrollLeft)
      const canMove = event.deltaY > 0 ? intendedPosition < max - 1 : intendedPosition > 1
      if (!canMove) return
      event.preventDefault()
      const distance = clamp(wheelDistance(event, canvas), -180, 180) * 0.38
      const state = existing ?? { target: canvas.scrollLeft, frame: null }
      state.target = clamp(state.target - distance, -max, 0)
      scrollStates.set(canvas, state)
      if (reducedMotion) {
        canvas.scrollTo({ left: state.target, behavior: 'auto' })
        return
      }
      if (state.frame === null) state.frame = window.requestAnimationFrame(() => animateColumns(canvas, state))
    }
    canvases.forEach((canvas) => canvas.addEventListener('wheel', moveColumns, { passive: false }))
    return () => {
      canvases.forEach((canvas) => canvas.removeEventListener('wheel', moveColumns))
      scrollStates.forEach((state) => {
        if (state.frame !== null) window.cancelAnimationFrame(state.frame)
      })
    }
  }, [loadedPassages, settings.mode, settings.writingDirection])

  useEffect(() => {
    function clearTermTimers() {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      hoverTimerRef.current = null
      closeTimerRef.current = null
    }
    function hide() {
      clearTermTimers()
      setActiveTerm(null)
    }
    function hideOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('scroll', hide, { passive: true })
    window.addEventListener('resize', hide)
    window.addEventListener('keydown', hideOnEscape)
    return () => {
      clearTermTimers()
      window.removeEventListener('scroll', hide)
      window.removeEventListener('resize', hide)
      window.removeEventListener('keydown', hideOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!activeTerm) return undefined

    function hideWhenPointerLeavesTerm(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.read-term') || target.closest('.term-float')) {
        clearCloseTimer()
        return
      }
      scheduleCloseTerm(120)
    }

    document.addEventListener('pointermove', hideWhenPointerLeavesTerm)
    return () => {
      document.removeEventListener('pointermove', hideWhenPointerLeavesTerm)
    }
  }, [activeTerm])

  useEffect(() => {
    function showFromNativeEvent(event: MouseEvent | PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('.read-term')
      if (!(button instanceof HTMLElement)) return
      const term = button.dataset.term
      if (!term) return
      const definition = definitions.get(term)
      if (!definition) return
      showTerm(definition, button)
    }

    document.addEventListener('pointerdown', showFromNativeEvent, true)
    document.addEventListener('click', showFromNativeEvent, true)
    return () => {
      document.removeEventListener('pointerdown', showFromNativeEvent, true)
      document.removeEventListener('click', showFromNativeEvent, true)
    }
  }, [definitions])

  function showTerm(definition: TermDefinition, element: HTMLElement) {
    clearHoverTimer()
    clearCloseTimer()
    const point = positionFromRect(element.getBoundingClientRect())
    setActiveTerm({ ...definition, ...point })
  }

  function clearHoverTimer() {
    if (!hoverTimerRef.current) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }

  function clearCloseTimer() {
    if (!closeTimerRef.current) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }

  function scheduleCloseTerm(delay = termCloseDelay) {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setActiveTerm(null)
      closeTimerRef.current = null
    }, delay)
  }

  function scheduleHoverTerm(definition: TermDefinition, element: HTMLElement) {
    clearHoverTimer()
    clearCloseTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      showTerm(definition, element)
      hoverTimerRef.current = null
    }, termHoverDelay)
  }

  function visibleOriginal(passage: SutraPassage) {
    if (settings.locale === 'zh-Hans' && passage.enrichment?.originalSimplified) return passage.enrichment.originalSimplified
    if (settings.locale === 'zh-Hant' && passage.enrichment?.originalTraditional) return passage.enrichment.originalTraditional
    return passage.original
  }

  function renderTermText(
    passage: SutraPassage,
    sourceText = visibleOriginal(passage),
    pinyinCursor: PinyinCursor = { index: 0, units: pinyinUnits(passage.enrichment?.originalSimplifiedPinyin) },
  ) {
    const noteDefinitions = new Map<string, TermDefinition>()
    for (const note of passage.readingNotes ?? passage.enrichment?.readingNotes ?? []) {
      const terms = settings.locale === 'zh-Hans'
        ? [note.termSimplified, note.termTraditional]
        : [note.termTraditional, note.termSimplified]
      for (const term of terms.filter(Boolean)) noteDefinitions.set(term, noteDefinition(note, term))
    }
    const ordered = [...new Set([...passage.terms, ...noteDefinitions.keys()])]
      .filter((term) => sourceText.includes(term))
      .sort((a, b) => b.length - a.length)
    const nodes: React.ReactNode[] = []
    const renderedTerms = new Set<string>()
    let cursor = 0
    let key = 0
    const showPinyin = settings.pinyin
    const renderText = (text: string, keyPrefix: string) => (
      showPinyin || /[\uE000-\uF8FF]/u.test(text)
        ? renderReaderText(text, keyPrefix, pinyinCursor, showPinyin)
        : text
    )

    while (cursor < sourceText.length) {
      let nextTerm = ''
      let nextIndex = sourceText.length
      for (const term of ordered) {
        const index = sourceText.indexOf(term, cursor)
        if (index >= 0 && index < nextIndex) {
          nextTerm = term
          nextIndex = index
        }
      }

      if (!nextTerm) {
        const text = sourceText.slice(cursor)
        nodes.push(renderText(text, `${passage.id}-tail-${key}`))
        break
      }

      if (nextIndex > cursor) {
        const text = sourceText.slice(cursor, nextIndex)
        nodes.push(renderText(text, `${passage.id}-text-${key}`))
      }
      const definition = definitions.get(nextTerm) ?? noteDefinitions.get(nextTerm)
      if (!definition || renderedTerms.has(definition.term)) {
        nodes.push(renderText(nextTerm, `${passage.id}-term-text-${key}`))
      } else {
        renderedTerms.add(definition.term)
        nodes.push(
          <button
            className="read-term"
            type="button"
            key={`${passage.id}-${nextTerm}-${key}`}
            data-term={definition.term}
            data-summary={definition.summary}
            data-note={definition.note}
            data-sanskrit={definition.sanskrit ?? ''}
            onPointerEnter={(event) => scheduleHoverTerm(definition, event.currentTarget)}
            onPointerLeave={() => {
              clearHoverTimer()
              scheduleCloseTerm()
            }}
            onPointerDown={(event) => showTerm(definition, event.currentTarget)}
            onClick={(event) => showTerm(definition, event.currentTarget)}
            onFocus={(event) => showTerm(definition, event.currentTarget)}
            onBlur={() => scheduleCloseTerm(120)}
          >
            {renderText(nextTerm, `${passage.id}-term-${key}`)}
          </button>,
        )
      }
      key += 1
      cursor = nextIndex + nextTerm.length
    }

    return nodes
  }

  function canSetManualReadingFocus(target: EventTarget | null) {
    if (!(target instanceof Element)) return false
    if (target.closest('a, button, input, select, textarea, summary')) return false
    return !window.getSelection()?.toString()
  }

  function selectPassage(passage: SutraPassage, target: EventTarget | null) {
    if (!canSetManualReadingFocus(target)) return
    focusPassage(passage.anchorId)
  }

  function originalSegmentId(passage: SutraPassage, index?: number) {
    return index === undefined ? `${passage.anchorId}-original` : `${passage.anchorId}-source-${index}`
  }

  function translationSegmentId(passage: SutraPassage, index?: number) {
    return index === undefined ? `${passage.anchorId}-translation-passage` : `${passage.anchorId}-translation-${index}`
  }

  function focusAbout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const target = document.getElementById('read-about')
    if (!target) return
    aboutModeRef.current = true
    cancelLoadMore()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#read-about`)
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      })
    })
    if (directoryScope === 'mobile') setSidebarOpen(false)
  }

  function focusOriginal(passage: SutraPassage, index?: number) {
    const targetKey = `${passage.anchorId}:${index ?? 'passage'}`
    focusPassage(passage.anchorId, originalSegmentId(passage, index))
    setPairedTarget(targetKey)
    if (pairedTargetTimerRef.current) window.clearTimeout(pairedTargetTimerRef.current)
    pairedTargetTimerRef.current = window.setTimeout(() => setPairedTarget(''), 1800)
    setTranslationReturnTarget({ id: translationSegmentId(passage, index), pairKey: targetKey, passageAnchor: passage.anchorId })
    try {
      if (!window.localStorage.getItem('guanzizai:reader-pair-hint:v1')) {
        window.localStorage.setItem('guanzizai:reader-pair-hint:v1', 'seen')
        setPairHintVisible(true)
      }
    } catch {
      setPairHintVisible(true)
    }
    if (settings.mode === 'plain') settings.setMode('parallel')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const exact = document.getElementById(originalSegmentId(passage, index))
      const fallback = document.getElementById(originalSegmentId(passage))
      ;(exact ?? fallback)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
  }

  function returnToTranslation() {
    const target = translationReturnTarget
    if (!target) return
    focusPassage(target.passageAnchor)
    setPairedTarget(target.pairKey)
    if (pairedTargetTimerRef.current) window.clearTimeout(pairedTargetTimerRef.current)
    pairedTargetTimerRef.current = window.setTimeout(() => setPairedTarget(''), 1800)
    setTranslationReturnTarget(null)
    setPairHintVisible(false)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
  }

  async function resumeReading() {
    if (!resumeCandidate) return
    const saved = resumeCandidate
    resolveResume()
    settings.setMode(saved.readerMode)
    if (settings.writingDirection !== saved.writingDirection) {
      settings.setWritingDirection(saved.writingDirection)
    }
    if (sutra.paginated) {
      await loadSection(saved.sequence)
      return
    }
    const passage = loadedPassages.find((item) => item.id === saved.passageId || item.seq === saved.sequence)
    if (!passage) return
    focusPassage(passage.anchorId)
    window.requestAnimationFrame(() => {
      document.getElementById(passage.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function alignedOriginalSegments(passage: SutraPassage) {
    const segments = passage.translationSegments
    const sourceBase = passage.enrichment?.originalSimplified
    const original = visibleOriginal(passage)
    if (!segments?.length || !sourceBase || sourceBase.length !== original.length) return null
    let cursor = 0
    const aligned: Array<{ index: number; text: string }> = []
    for (const segment of segments) {
      const start = sourceBase.indexOf(segment.source, cursor)
      if (start < 0) return null
      const end = start + segment.source.length
      const gap = original.slice(cursor, start)
      if (gap.trim() && aligned.length) aligned[aligned.length - 1].text += gap
      aligned.push({ index: segment.index, text: original.slice(start, end) })
      cursor = end
    }
    if (cursor < original.length && aligned.length && original.slice(cursor).trim()) {
      aligned[aligned.length - 1].text += original.slice(cursor)
    }
    return aligned
  }

  function verticalFrameStyle(passage: SutraPassage) {
    const frame = estimateVerticalFrameDimensions(
      settings.mode === 'plain' && passage.plain ? passage.plain : visibleOriginal(passage),
      settings.fontSize,
      settings.lineHeight,
    )
    return {
      '--vertical-frame-width': `${frame.width}px`,
      '--vertical-frame-height': `${frame.height}px`,
    } as CSSProperties
  }

  function compactVerticalFlowStyle(passages = loadedPassages) {
    const frame = estimateVerticalFrameDimensions(
      passages.map((passage) => visibleOriginal(passage)).join('\n'),
      settings.fontSize,
      settings.lineHeight,
    )
    return {
      '--vertical-frame-width': `${frame.width}px`,
      '--vertical-frame-height': `${frame.height}px`,
    } as CSSProperties
  }

  function continuousVerticalFlowStyle(passages: SutraPassage[]) {
    return compactVerticalFlowStyle(passages)
  }

  function renderOriginal(passage: SutraPassage) {
    const original = visibleOriginal(passage)
    const aligned = alignedOriginalSegments(passage)
    const pinyinCursor: PinyinCursor = {
      index: 0,
      units: pinyinUnits(passage.enrichment?.originalSimplifiedPinyin),
    }
    if (aligned) {
      return aligned.map((segment) => {
        const text = cleanReaderText(segment.text).trim()
        const heading = isStructuredReadingHeading(segment.text)
        const versePhrases = heading ? [] : readingVersePhrases(text)
        return (
          <span
            className={cn('read-source-segment', heading && 'read-source-heading', versePhrases.length && 'read-source-verse')}
            id={originalSegmentId(passage, segment.index)}
            data-passage-id={passage.anchorId}
            data-focus-id={originalSegmentId(passage, segment.index)}
            data-reading-active={activeReadingLine === originalSegmentId(passage, segment.index) ? 'true' : undefined}
            data-pair-active={pairedTarget === `${passage.anchorId}:${segment.index}` ? 'true' : undefined}
            key={`${passage.id}-source-${segment.index}`}
            onClick={(event) => {
              if (!canSetManualReadingFocus(event.target)) return
              focusPassage(passage.anchorId, originalSegmentId(passage, segment.index))
            }}
          >
            {versePhrases.length ? (
              <span className="read-verse-phrases">
                {versePhrases.map((phrase, phraseIndex) => (
                  <span key={`${passage.id}-source-${segment.index}-phrase-${phraseIndex}`}>
                    {renderTermText({ ...passage, id: `${passage.id}-source-${segment.index}-phrase-${phraseIndex}` }, phrase, pinyinCursor)}
                  </span>
                ))}
              </span>
            ) : renderTermText({ ...passage, id: `${passage.id}-source-${segment.index}` }, text, pinyinCursor)}
          </span>
        )
      })
    }
    if (!sutra.paginated && !original.includes('\n') && original.length <= 300) {
      return renderTermText(passage, cleanReaderText(original), pinyinCursor)
    }
    const paragraphs = readingParagraphs(cleanReaderText(original))
    return paragraphs.map((line, index) => {
      const trimmed = line.trim()
      const heading = isStructuredReadingHeading(trimmed)
      const versePhrases = heading ? [] : readingVersePhrases(trimmed)
      const commentary = /^(异史氏曰|外史氏曰|纪昀曰)/u.test(trimmed)
      const lineAnchor = readingLineAnchor(passage.anchorId, index, heading)
      return (
        <span
          className={cn('read-source-line', heading && 'read-source-heading', versePhrases.length && 'read-source-verse', commentary && 'read-source-commentary')}
          id={lineAnchor}
          data-passage-id={passage.anchorId}
          data-focus-id={lineAnchor}
          data-reading-active={activeReadingLine === lineAnchor ? 'true' : undefined}
          onClick={(event) => {
            if (!canSetManualReadingFocus(event.target)) return
            focusPassage(passage.anchorId, lineAnchor)
          }}
          key={`${passage.id}-line-${index}`}
        >
          {versePhrases.length ? (
            <span className="read-verse-phrases">
              {versePhrases.map((phrase, phraseIndex) => (
                <span key={`${passage.id}-line-${index}-phrase-${phraseIndex}`}>
                  {renderTermText({ ...passage, id: `${passage.id}-line-${index}-phrase-${phraseIndex}` }, phrase, pinyinCursor)}
                </span>
              ))}
            </span>
          ) : renderTermText({ ...passage, id: `${passage.id}-line-${index}` }, line, pinyinCursor)}
        </span>
      )
    })
  }

  function renderTranslation(passage: SutraPassage) {
    if (!passage.plain) return <p>本篇暂未提供白话译文。</p>
    const canLocateOriginal = settings.mode === 'parallel'
    if (passage.translationSegments?.length) {
      return passage.translationSegments.map((segment) => {
        const heading = isStructuredReadingHeading(segment.source)
        return (
          <div
            className={cn('read-translation-segment', heading && 'read-translation-heading')}
            id={translationSegmentId(passage, segment.index)}
            data-pair-active={pairedTarget === `${passage.anchorId}:${segment.index}` ? 'true' : undefined}
            key={`${passage.id}-translation-${segment.index}`}
          >
            <p onDoubleClick={canLocateOriginal ? () => focusOriginal(passage, segment.index) : undefined}>{cleanReaderText(segment.translation)}</p>
            {canLocateOriginal ? (
              <Button type="button" size="compactIcon" variant="ghost" title="定位对应原文" aria-label="定位对应原文" onClick={() => focusOriginal(passage, segment.index)}>
                <LocateFixed aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )
      })
    }
    return (
      <div className="read-translation-segment" id={translationSegmentId(passage)} data-pair-active={pairedTarget === `${passage.anchorId}:passage` ? 'true' : undefined}>
        <p onDoubleClick={canLocateOriginal ? () => focusOriginal(passage) : undefined}>{cleanReaderText(passage.plain)}</p>
        {canLocateOriginal ? (
          <Button type="button" size="compactIcon" variant="ghost" title="定位对应原文" aria-label="定位对应原文" onClick={() => focusOriginal(passage)}>
            <LocateFixed aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="read-page" data-locale-skip>
      <div
        className="read-progress"
        data-buffering={switchingSection ? 'true' : undefined}
        role="progressbar"
        aria-label="全书阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bookProgress * 100)}
        style={{ transform: `scaleX(${bookProgress})` }}
      />
      {resumeCandidate ? (
        <div className="read-resume-prompt" role="status" aria-live="polite">
          <History aria-hidden="true" />
          <span>上次读到第 {resumeCandidate.sequence} 段</span>
          <Button type="button" size="sm" variant="default" onClick={() => void resumeReading()}>继续阅读</Button>
          <Button type="button" size="sm" variant="ghost" onClick={resolveResume}>从头开始</Button>
        </div>
      ) : null}
      {translationReturnTarget ? (
        <div className="read-translation-return" role="status" aria-live="polite">
          <span>{pairHintVisible ? '已定位到对应原文，需要时可以回到刚才的白话。' : '已定位对应原文'}</span>
          <Button type="button" size="sm" variant="outline" onClick={returnToTranslation}>
            <CornerUpLeft aria-hidden="true" />
            回到刚才的白话
          </Button>
          <button type="button" className="read-translation-return-close" aria-label="关闭返回提示" onClick={() => { setTranslationReturnTarget(null); setPairHintVisible(false) }}>×</button>
        </div>
      ) : null}
      <div
        className="read-shell"
        data-sidebar={sidebarOpen ? 'open' : 'closed'}
        data-writing={settings.writingDirection}
        data-vertical-layout={verticalLayout}
      >
        <aside className="read-sidebar" id="read-directory" aria-label="典籍目录">
          <div className="read-sidebar-head">
            <div>
              <span className="read-sidebar-kicker">本书目录</span>
              <h2 className="read-sidebar-title">{localizedShortTitle}</h2>
              <p className="read-sidebar-meta">{localizedContributor} · {sutra.juanCount} 卷</p>
            </div>
            <Button
              className="read-sidebar-close read-action-button"
              type="button"
              variant="ghost"
              size="compactIcon"
              aria-label="收起目录"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose />
            </Button>
          </div>
          <nav className="read-toc" aria-label="正文段落">
            <a className="read-toc-primary" href="#read-text" onClick={() => { aboutModeRef.current = false }}>
              <span>正文</span><small>{totalPassages} 段</small>
            </a>
            {sutra.paginated ? (
              <>
                {hasDualToc ? (
                  <div className="read-toc-switch" role="group" aria-label="目录显示方式">
                    <button type="button" data-active={tocView === 'contents' ? 'true' : undefined} onClick={() => setTocView('contents')}>目录</button>
                    <button type="button" data-active={tocView === 'volumes' ? 'true' : undefined} onClick={() => setTocView('volumes')}>分卷</button>
                  </div>
                ) : null}
                {outlineLoading ? (
                  <div className="read-toc-loading" role="status">正在载入本书目录…</div>
                ) : visibleOutline.length ? (
                  <div className="read-toc-outline" ref={tocOutlineRef}>
                    {visibleOutline.map((item) => (
                      <a
                        href={`/read/${sutra.id}?start=${item.sequence}`}
                        key={item.key}
                        data-level={item.level}
                        aria-current={currentOutlineKey === item.key ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          void loadSection(item.sequence)
                        }}
                        onPointerEnter={() => prefetchSection(item.sequence)}
                        onFocus={() => prefetchSection(item.sequence)}
                      >
                        <span title={item.title}>{item.title}</span>
                        <small>{item.endSequence > item.sequence ? `${item.endSequence - item.sequence + 1} 段` : `第 ${item.sequence} 段`}</small>
                      </a>
                    ))}
                  </div>
                ) : null}
                {visibleOutline.length ? (
                  <small className="read-toc-outline-note">
                    {tocView === 'volumes' && volumeEntries.length ? `${volumeEntries.length} 卷` : `${visibleOutline.length} 个目录项`}
                  </small>
                ) : null}
              </>
            ) : loadedPassages.map((passage) => (
              <a
                href={`#${passage.anchorId}`}
                key={passage.id}
                aria-current={activeAnchor === passage.anchorId ? 'location' : undefined}
                onClick={() => {
                  focusPassage(passage.anchorId)
                  if (directoryScope === 'mobile') setSidebarOpen(false)
                }}
              >
                <span>第 {passageNumber(passage.seq)} 段</span>
                <span>卷 {passage.juan}</span>
              </a>
            ))}
            <div className="read-toc-footer">
              {sutra.paginated ? (
                <div className="read-toc-progress" role="status" aria-live="polite">
                  <div className="read-toc-progress-head">
                    <span className="read-toc-progress-label">载入状态</span>
                    <strong>{loadedPassages.length} / {totalPassages} 段</strong>
                  </div>
                  <div className="read-toc-progress-track" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (loadedPassages.length / Math.max(totalPassages, 1)) * 100)}%` }} />
                  </div>
                  <p>{switchingSection ? '正在切换章节…' : currentStartSequence ? `从第 ${currentStartSequence} 段开始` : '从正文开头开始'}<small>向下阅读自动续载</small></p>
                </div>
              ) : (
                <div className="read-toc-progress" role="status">
                  <div className="read-toc-progress-head">
                    <span className="read-toc-progress-label">正文状态</span>
                    <strong>全文已载入</strong>
                  </div>
                  <p>共 {loadedPassages.length} 段，可从目录直接跳转</p>
                </div>
              )}
              <a className="read-toc-about" href="#read-about" onClick={focusAbout}>
                <span><FileText aria-hidden="true" />本书说明</span>
                <ChevronRight aria-hidden="true" />
              </a>
            </div>
          </nav>
        </aside>
        {sidebarOpen ? (
          <button
            className="read-backdrop"
            type="button"
            aria-label="关闭目录"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="read-main">
          <header className="read-topbar">
            <div className="read-topbar-inner">
              <div className="read-topbar-left">
                <Button
                  className="read-action-button read-directory-toggle"
                  type="button"
                  variant="ghost"
                  size="compactIcon"
                  aria-label={sidebarOpen ? '关闭目录' : '打开目录'}
                  aria-expanded={sidebarOpen}
                  aria-controls="read-directory"
                  onClick={() => setSidebarOpen((value) => !value)}
                >
                  {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
                <nav className="read-breadcrumbs" aria-label="阅读位置">
                  <Link href="/">
                    <House aria-hidden="true" />
                    观自在
                  </Link>
                  <Link href="/sutras">
                    <LibraryBig aria-hidden="true" />
                    古籍馆
                  </Link>
                  <strong>{localizedShortTitle}</strong>
                </nav>
              </div>

              <div className="read-topbar-actions">
                <Button
                  className="read-action-button read-bookmark-button"
                  variant="ghost"
                  size="compactIcon"
                  type="button"
                  aria-label={readerLibrary.activeBookmark ? '取消收藏当前页面' : '收藏当前页面'}
                  aria-pressed={Boolean(readerLibrary.activeBookmark)}
                  title={readerLibrary.activeBookmark ? '取消收藏' : '收藏当前页'}
                  disabled={readerLibrary.bookmarkBusy || !activePassage}
                  onClick={() => void readerLibrary.toggleBookmark()}
                >
                  {readerLibrary.activeBookmark ? <BookmarkCheck /> : <Bookmark />}
                </Button>
                <Sheet open={contributionOpen} onOpenChange={(open) => {
                  setContributionOpen(open)
                  if (open && contributionState !== 'sending') setContributionState('idle')
                }}>
                  <SheetTrigger asChild>
                    <Button className="read-action-button" variant="ghost" size="compactIcon" aria-label="贡献译文">
                      <Send />
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="read-contribution-sheet" side="right">
                    <SheetHeader className="read-contribution-hero">
                      <span className="read-contribution-mark" aria-hidden="true"><FilePenLine /></span>
                      <div>
                        <span className="kicker">共同整理</span>
                        <SheetTitle>贡献{localizedShortTitle}白话译文</SheetTitle>
                        <SheetDescription>逐段提交 · 来源清楚 · 审核后署名展示</SheetDescription>
                      </div>
                    </SheetHeader>
                    <div className="read-contribution-source-callout">
                      <strong>不只是译文</strong>
                      <p>如果你有可核验的原文、版本、授权译本、勘误记录或机构合作线索，可以提交到共建典藏。</p>
                      <Button asChild variant="outline"><Link href={`/contribute?work=${encodeURIComponent(sutra.shortTitle)}`}>贡献其他资料</Link></Button>
                    </div>
                    {!session.authenticated ? (
                      <div className="read-contribution-login">
                        <span className="read-contribution-login-icon"><UserRound aria-hidden="true" /></span>
                        <h3>登录后参与整理</h3>
                        <p>提交记录与账户绑定，邮箱和第三方账号信息不会公开。</p>
                        <div className="read-contribution-benefits">
                          <span><CheckCircle2 />保留公开署名</span>
                          <span><ShieldCheck />译文先审后发</span>
                          <span><ScrollText />来源可追溯</span>
                        </div>
                        <Button asChild className="read-contribution-login-button"><Link href={`/login?next=${encodeURIComponent(`/read/${sutra.id}`)}`}>登录后贡献译文</Link></Button>
                      </div>
                    ) : contributionState === 'sent' ? (
                      <div className="read-contribution-complete" role="status">
                        <span><CheckCircle2 /></span>
                        <h3>译文已进入审核</h3>
                        <p>采用后会在阅读页显示你的公开署名。</p>
                        <Button type="button" variant="outline" onClick={() => setContributionState('idle')}>继续提交下一段</Button>
                      </div>
                    ) : (
                      <form className="read-contribution-form" onSubmit={submitContribution}>
                        <section className="read-contribution-step">
                          <header><span>一</span><div><h3>选择原文</h3><small>当前已载入段落</small></div></header>
                          <label className="read-contribution-field">
                            <select value={contributionPassageId} onChange={(event) => setContributionPassageId(event.target.value)} aria-label="选择原文段落">
                              {loadedPassages.map((passage) => <option value={passage.id} key={passage.id}>第 {passage.seq} 段 · {passage.original.slice(0, 24)}</option>)}
                            </select>
                          </label>
                          <div className="read-contribution-source-text" key={contributionPassageId}>{loadedPassages.find((passage) => passage.id === contributionPassageId)?.original.slice(0, 420)}</div>
                        </section>

                        <section className="read-contribution-step">
                          <header><span>二</span><div><h3>填写白话</h3><small>忠实原意，不增补情节</small></div></header>
                          <label className="read-contribution-field">
                            <textarea name="translation" rows={8} required minLength={4} value={contributionText} onChange={(event) => setContributionText(event.target.value)} placeholder="在这里写下这一段的白话译文…" />
                            <small className="read-contribution-count">{contributionText.length} 字</small>
                          </label>
                        </section>

                        <section className="read-contribution-step">
                          <header><span>三</span><div><h3>来源与署名</h3><small>审核与公开说明</small></div></header>
                          <div className="read-contribution-source-options">
                            {([['original', '本人原创'], ['licensed', '授权译本'], ['other', '其他来源']] as const).map(([value, label]) => (
                              <label data-active={contributionSourceType === value ? 'true' : undefined} key={value}>
                                <input type="radio" name="sourceType" value={value} checked={contributionSourceType === value} onChange={() => setContributionSourceType(value)} />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>
                          {contributionSourceType !== 'original' ? (
                            <div className="read-contribution-two-fields">
                              <label className="read-contribution-field"><span>来源名称</span><input name="sourceName" required placeholder="译本或提供方" /></label>
                              <label className="read-contribution-field"><span>来源链接</span><input name="sourceUrl" type="url" placeholder="https://" /></label>
                            </div>
                          ) : <input name="sourceName" type="hidden" value="" />}
                          <label className="read-contribution-field"><span>许可或原创声明</span><textarea name="licenseNote" rows={3} required placeholder="确认有权提交并允许本站公开展示" /></label>
                          <label className="read-contribution-field"><span>公开署名</span><input name="contributorName" defaultValue={session.user?.name ?? ''} required /></label>
                        </section>
                        {contributionState === 'error' ? <p className="read-contribution-error">提交未完成，请检查来源信息后重试。</p> : null}
                        <SheetFooter className="read-contribution-footer"><small>提交后可在账户中查看状态</small><Button type="submit" disabled={contributionState === 'sending'}>{contributionState === 'sending' ? '正在提交…' : '提交审核'}</Button></SheetFooter>
                      </form>
                    )}
                  </SheetContent>
                </Sheet>
                <ReaderExportSheet
                  sutra={sutra}
                  outline={outline}
                  contentVersion={contentVersion}
                  totalPassages={totalPassages}
                  authenticated={session.authenticated}
                  userName={session.user?.name}
                  currentReaderSettings={{
                    font: settings.font,
                    fontSize: settings.fontSize,
                    lineHeight: settings.lineHeight,
                    writingDirection: settings.writingDirection,
                  }}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="read-action-button read-mode-button" variant="outline" size="sm">
                      <BookOpen /> <span className="read-mode-label">{modeLabel}</span> <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>阅读模式</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {modes.map((item) => (
                      <DropdownMenuItem key={item.value} onClick={() => chooseReaderMode(item.value)}>
                        <span className={cn('h-2 w-2 rounded-full', settings.mode === item.value ? 'bg-primary' : 'bg-muted')} />
                        <span>
                          {item.label}
                          <small className="block text-xs text-muted-foreground">{item.description}</small>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="read-action-button" variant="ghost" size="compactIcon" aria-label="阅读设置">
                      <Settings />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="read-settings-menu">
                    <DropdownMenuLabel className="read-settings-head">
                      <span><Text size={15} /> 阅读设置</span>
                      <small>自动保存</small>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="settings-grid">
                      <div className="settings-columns">
                        <section className="settings-section" aria-label="字体与排版">
                          <h3>字体与排版</h3>
                          <div className="settings-control">
                            <div className="settings-control-head">
                              <span>正文字体</span>
                              <strong>{settings.font === 'readable' ? '舒适宋体' : '古籍字体'}</strong>
                            </div>
                            <div className="settings-segment read-font-options">
                              <Button type="button" className="read-setting-button read-font-readable" size="sm" variant={settings.font === 'readable' ? 'default' : 'secondary'} onClick={() => settings.setFont('readable')}>舒适宋体</Button>
                              <Button type="button" className="read-setting-button read-font-classic" size="sm" variant={settings.font === 'classic' ? 'default' : 'secondary'} onClick={() => settings.setFont('classic')}>古籍字体</Button>
                            </div>
                            <small className="settings-control-note">标题固定使用古籍字体</small>
                          </div>
                          <div className="settings-control">
                            <div className="settings-control-head"><span>字号</span><strong>{settings.fontSize}</strong></div>
                            <div className="settings-stepper">
                              <Button type="button" className="read-setting-button" size="compactIcon" variant="secondary" aria-label="减小字体" onClick={() => settings.setFontSize((value) => clamp(value - 1, minFontSize, maxFontSize))}>−</Button>
                              <input aria-label="字体大小" min={minFontSize} max={maxFontSize} step={1} type="range" value={settings.fontSize} onChange={(event) => settings.setFontSize(Number(event.target.value))} />
                              <Button type="button" className="read-setting-button" size="compactIcon" variant="secondary" aria-label="增大字体" onClick={() => settings.setFontSize((value) => clamp(value + 1, minFontSize, maxFontSize))}>＋</Button>
                            </div>
                          </div>
                          <div className="settings-control compact-range">
                            <div className="settings-control-head"><span>行距</span><strong>{settings.lineHeight.toFixed(1)}</strong></div>
                            <input aria-label="行距" min={minLineHeight} max={maxLineHeight} step={0.1} type="range" value={settings.lineHeight} onChange={(event) => settings.setLineHeight(Number(event.target.value))} />
                          </div>
                        </section>

                        <section className="settings-section" aria-label="阅读方式">
                          <h3>阅读方式</h3>
                          <div className="settings-control">
                            <div className="settings-control-head"><span>主题</span><strong>{settings.theme === 'light' ? '浅色' : '深色'}</strong></div>
                            <div className="settings-segment settings-two-up">
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.theme === 'light' ? 'default' : 'secondary'} onClick={() => settings.setTheme('light')}><Sun />浅色</Button>
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.theme === 'dark' ? 'default' : 'secondary'} onClick={() => settings.setTheme('dark')}><Moon />深色</Button>
                            </div>
                          </div>
                          <div className="settings-control">
                            <div className="settings-control-head"><span>内容</span><strong>{modeLabel}</strong></div>
                            <div className="settings-segment settings-segment-grid">
                              {modes.map((item) => <Button type="button" className="read-setting-button" key={item.value} size="sm" variant={settings.mode === item.value ? 'default' : 'secondary'} onClick={() => chooseReaderMode(item.value)}>{item.label}</Button>)}
                            </div>
                          </div>
                          <div className="settings-control">
                            <div className="settings-control-head"><span>排版方向</span><strong>{settings.writingDirection === 'vertical' ? '纵书 Beta' : '横排'}</strong></div>
                            <div className="settings-segment settings-two-up">
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.writingDirection === 'horizontal' ? 'default' : 'secondary'} onClick={() => settings.setWritingDirection('horizontal')}>横排</Button>
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.writingDirection === 'vertical' ? 'default' : 'secondary'} onClick={() => settings.setWritingDirection('vertical')}>纵书 Beta</Button>
                            </div>
                            <small className="settings-control-note">纵书默认古籍字体与 {verticalDefaultLineHeight.toFixed(1)} 行距；白话辅助始终使用舒适宋体</small>
                          </div>
                          <div className="settings-control">
                            <div className="settings-control-head">
                              <span>对照布局</span>
                              <strong>{comparisonLayouts.find((item) => item.value === settings.comparisonLayout)?.label ?? '智能'}</strong>
                            </div>
                            <div className="settings-segment settings-segment-grid">
                              {comparisonLayouts.map((item) => (
                                <Button
                                  type="button"
                                  className="read-setting-button"
                                  key={item.value}
                                  size="sm"
                                  variant={settings.comparisonLayout === item.value ? 'default' : 'secondary'}
                                  onClick={() => settings.setComparisonLayout(item.value)}
                                >
                                  {item.label}
                                </Button>
                              ))}
                            </div>
                            <small className="settings-control-note">默认上下分节，左右与智能布局可按需要切换</small>
                          </div>
                          <div className="settings-control">
                            <div className="settings-control-head"><span>版心宽度</span><strong>{settings.width === 'normal' ? '标准' : '宽版'}</strong></div>
                            <div className="settings-segment settings-two-up">
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.width === 'normal' ? 'default' : 'secondary'} onClick={() => settings.setWidth('normal')}>标准</Button>
                              <Button type="button" className="read-setting-button" size="sm" variant={settings.width === 'wide' ? 'default' : 'secondary'} onClick={() => settings.setWidth('wide')}>宽版</Button>
                            </div>
                          </div>
                        </section>
                      </div>

                      <section className="settings-quick-row" aria-label="辅助显示">
                        <span>辅助显示</span>
                        <Button type="button" className="read-switch-button" size="sm" variant={settings.pinyin ? 'default' : 'secondary'} aria-pressed={settings.pinyin} onClick={() => settings.setPinyin(!settings.pinyin)}>拼音 {settings.pinyin ? '开' : '关'}</Button>
                        <Button type="button" className="read-switch-button" size="sm" variant={settings.locale === 'zh-Hans' ? 'default' : 'secondary'} aria-pressed={settings.locale === 'zh-Hans'} onClick={() => settings.setLocale(settings.locale === 'zh-Hans' ? 'zh-Hant' : 'zh-Hans')}><Languages aria-hidden="true" />{settings.locale === 'zh-Hans' ? '简体' : '繁体'}</Button>
                      </section>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <LanguageToggle />
              </div>
            </div>
          </header>

          <div className="read-canvas">
            <article className="read-paper">
              <header className="read-paper-head">
                <span className="kicker">{sutra.category}</span>
                <h1>{localizedTitle}</h1>
                <p>{localizedContributor}</p>
                {sourceVerification ? (
                  <p className="read-source-verification-note">
                    <strong>{sourceVerification.label}</strong>
                    <span>{sourceVerification.description}</span>
                  </p>
                ) : null}
                <section className="read-overview-card" aria-labelledby="read-overview-title">
                  <div className="read-overview-head">
                    <h2 id="read-overview-title">关于{localizedShortTitle}</h2>
                    <span>
                      {stats.originalCharCount.toLocaleString('zh-CN')} 字 · 约 {stats.estimatedReadingMinutes} 分钟
                    </span>
                  </div>
                  <p>{localizedOverview}</p>
                </section>
              </header>

              <section
                ref={readArticleRef}
                id="read-text"
                className="read-article"
                data-locale-skip
                aria-busy={switchingSection}
                data-mode={settings.mode}
                data-width={settings.width}
                data-comparison-layout={settings.comparisonLayout}
                data-writing={settings.writingDirection}
                data-vertical-flow={continuousVerticalFlow ? 'continuous' : compactVerticalParallel ? 'compact-parallel' : undefined}
                data-pinyin={settings.pinyin ? 'on' : 'off'}
                data-paginated={sutra.paginated ? 'true' : undefined}
                data-reading-density={readingDensity}
                style={readArticleStyle}
                aria-label="典籍正文"
              >
                {hasPreviousPassages ? (
                  <div className="read-load-previous" ref={loadPreviousRef} aria-live="polite">
                    {loadingPrevious ? '正在续载上文…' : '向上阅读时自动续载上文'}
                  </div>
                ) : null}
                {continuousVerticalFlow ? (
                  <section className="read-vertical-flow" aria-label={`${sutra.shortTitle}连续纵书`}>
                    {continuousVerticalGroups.map((group, groupIndex) => {
                      const activeInGroup = activePassage && group.some((passage) => passage.id === activePassage.id)
                      return (
                        <section
                          className="read-vertical-flow-group"
                          key={`vertical-flow-${group[0]?.id ?? groupIndex}`}
                          style={continuousVerticalFlowStyle(group)}
                        >
                          <div className="read-original read-vertical-flow-canvas" aria-label={`${sutra.shortTitle}连续纵书第 ${groupIndex + 1} 组`}>
                            {group.map((passage) => (
                              <span
                                className="read-passage read-vertical-flow-passage"
                                id={passage.anchorId}
                                key={passage.id}
                                data-active={activeAnchor === passage.anchorId ? 'true' : undefined}
                                onClick={(event) => selectPassage(passage, event.target)}
                              >
                                <span
                                  className="read-vertical-flow-source"
                                  id={originalSegmentId(passage)}
                                  data-pair-active={pairedTarget === `${passage.anchorId}:passage` ? 'true' : undefined}
                                >
                                  {renderOriginal(passage)}
                                </span>
                              </span>
                            ))}
                          </div>
                          {settings.mode === 'parallel' ? (
                            <div className="read-plain read-vertical-flow-translations" aria-label="本组白话辅助">
                              {group.map((passage) => (
                                <section
                                  className="read-vertical-flow-translation"
                                  data-active={activeAnchor === passage.anchorId ? 'true' : undefined}
                                  key={`${passage.id}-vertical-translation`}
                                >
                                  <small>第 {passage.seq} 段 · {passage.translationLabel ?? '白话辅助'}</small>
                                  {passage.plain ? renderTranslation(passage) : <p>本段暂未提供白话译文。</p>}
                                </section>
                              ))}
                            </div>
                          ) : null}
                          {activeInGroup && activePassage && hasReadingMaterials(activePassage) ? (
                            <div className="read-vertical-flow-materials">
                              <small>第 {activePassage.seq} 段阅读资料</small>
                              <ReadingMaterials
                                passage={activePassage}
                                locale={settings.locale}
                                onRequestEnrichment={ensurePassageEnrichments}
                              />
                            </div>
                          ) : null}
                        </section>
                      )
                    })}
                  </section>
                ) : compactVerticalParallel ? (
                  <section className="read-compact-parallel" aria-label={`${sutra.shortTitle}分组纵书对照`}>
                    {compactParallelGroups.map((group, groupIndex) => (
                      <section
                        className="read-compact-parallel-group"
                        key={`compact-parallel-${group[0]?.id ?? groupIndex}`}
                        style={compactVerticalFlowStyle(group)}
                      >
                        <div className="read-original read-compact-flow-canvas read-compact-parallel-original">
                          {group.map((passage) => (
                            <span
                              className="read-passage read-compact-flow-passage"
                              id={passage.anchorId}
                              key={passage.id}
                              data-active={activeAnchor === passage.anchorId ? 'true' : undefined}
                              onClick={(event) => selectPassage(passage, event.target)}
                            >
                              <span
                                className="read-compact-flow-source"
                                id={originalSegmentId(passage)}
                                data-pair-active={pairedTarget === `${passage.anchorId}:passage` ? 'true' : undefined}
                              >
                                {renderOriginal(passage)}
                              </span>
                            </span>
                          ))}
                        </div>
                        <div className="read-plain read-compact-parallel-plain" aria-label="本组白话辅助">
                          <small className="read-translation-label">白话辅助</small>
                          {group.map((passage) => (
                            <section
                              className="read-compact-parallel-translation"
                              data-active={activeAnchor === passage.anchorId ? 'true' : undefined}
                              key={`${passage.id}-compact-translation`}
                            >
                              <small>第 {passage.seq} 段</small>
                              {passage.plain ? renderTranslation(passage) : <p>本段暂未提供白话译文。</p>}
                            </section>
                          ))}
                        </div>
                      </section>
                    ))}
                    {activePassage && hasReadingMaterials(activePassage) ? (
                      <div className="read-compact-flow-materials">
                        <small>第 {activePassage.seq} 段阅读资料</small>
                        <ReadingMaterials
                          passage={activePassage}
                          locale={settings.locale}
                          onRequestEnrichment={ensurePassageEnrichments}
                        />
                      </div>
                    ) : null}
                  </section>
                ) : loadedPassages.map((passage) => (
                  <section
                    className="read-passage"
                    id={passage.anchorId}
                    key={passage.id}
                    data-active={activeAnchor === passage.anchorId ? 'true' : undefined}
                    style={verticalFrameStyle(passage)}
                  >
                    <div
                      className="read-original"
                      id={originalSegmentId(passage)}
                      data-pair-active={pairedTarget === `${passage.anchorId}:passage` ? 'true' : undefined}
                      onClick={(event) => selectPassage(passage, event.target)}
                    >
                      {renderOriginal(passage)}
                    </div>
                    <div className="read-plain" aria-label={passage.translationLabel ?? '白话辅助'}>
                      {passage.plain ? (
                        <>
                          <small className="read-translation-label">{passage.translationLabel ?? '白话辅助'}</small>
                          {renderTranslation(passage)}
                        </>
                      ) : <p>本篇暂未提供白话译文。</p>}
                    </div>
                    <ReadingMaterials
                      passage={passage}
                      locale={settings.locale}
                      onRequestEnrichment={ensurePassageEnrichments}
                    />
                  </section>
                ))}
                {sutra.paginated ? (
                  <div className="read-load-more" ref={loadMoreRef} aria-live="polite">
                    {hasMorePassages
                      ? (loadingMore ? '正在续载正文…' : `已载入 ${loadedPassages.length} / ${totalPassages} 段`)
                      : `全文 ${totalPassages} 段已载入`}
                  </div>
                ) : null}
              </section>
            </article>

            <section id="read-about" className="quiet-panel mt-6">
              <h2 className="text-xl font-bold">本书说明</h2>
              <p className="mt-3 leading-8 text-muted-foreground">{localizedDescription}</p>
              {sutra.sourceUrl ? (
                <p className="read-edition-note">
                  <span>{sutra.sourceEdition}</span>
                  <a href={sutra.sourceUrl} target="_blank" rel="noreferrer">版本记录</a>
                  {sutra.sourceEdition.includes('CC BY-SA 4.0') ? (
                    <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">许可条款</a>
                  ) : null}
                </p>
              ) : null}
            </section>
            {contributors.length ? (
              <section className="read-contributors" aria-label="白话译文贡献者">
                <h2>白话译文贡献</h2>
                <p>本页已采用译文由 {contributors.join('、')} 提交，经审核后展示。</p>
              </section>
            ) : null}
          </div>
        </main>
      </div>

      {activeTerm ? (
        <aside
          className="term-float"
          role="tooltip"
          style={{ left: activeTerm.x, top: activeTerm.y }}
          onPointerEnter={clearCloseTimer}
          onPointerLeave={() => scheduleCloseTerm(160)}
        >
          <span className="kicker">术语</span>
          <strong>{activeTerm.term}</strong>
          <em>{activeTerm.sanskrit || '以原文语境为准'}</em>
          <p>{activeTerm.summary}</p>
          <small>{activeTerm.note}</small>
        </aside>
      ) : null}
      {readerLibrary.selection ? (
        <ReaderSelectionToolbar
          selection={readerLibrary.selection}
          onCopy={() => void readerLibrary.copySelection()}
          onHighlight={() => void readerLibrary.saveHighlight()}
          onShare={() => void readerLibrary.shareSelection()}
          onReport={readerLibrary.reportSelection}
        />
      ) : null}
      {readerLibrary.libraryNotice ? (
        <div className="read-library-toast" data-state={readerLibrary.libraryNotice.state} role="status" aria-live="polite">
          <span aria-hidden="true" />
          {readerLibrary.libraryNotice.message}
        </div>
      ) : null}
    </div>
  )
}
