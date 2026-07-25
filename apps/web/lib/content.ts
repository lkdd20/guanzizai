export type ReaderMode = 'original' | 'plain' | 'parallel'
export type LibraryKind = '佛典' | '国学'
export type SourceVerification = 'unverified' | 'spot_checked' | 'verified'

export interface PassageReadingNote {
  termTraditional: string
  termSimplified: string
  pinyin?: string
  explanation: string
  category?: string
  source?: string
  confidence?: string
}

export interface PassageEnrichment {
  sourceRecordId: string
  titleTraditional: string
  titleSimplified: string
  titleIsOriginal: boolean
  originalTraditional: string
  originalSimplified: string
  originalSimplifiedPinyin: string
  pinyinStatus: string
  keywords: string[]
  readingNotes: PassageReadingNote[]
  sourceUrl: string
  sourceRevisionId: string
  sourceLicense: string
  sourceRecordHash: string
}

export interface TranslationAlignmentSegment {
  index: number
  source: string
  translation: string
}

export interface SutraPassage {
  id: string
  anchorId: string
  seq: number
  juan: number
  sourceRef: string
  original: string
  plain: string
  translationOrigin?: 'ai' | 'licensed' | 'manual'
  translationLabel?: string
  translationContributor?: string
  translationSegments?: TranslationAlignmentSegment[]
  enrichmentAvailable?: boolean
  readingNotes?: PassageReadingNote[]
  keywords?: string[]
  enrichment?: PassageEnrichment
  terms: string[]
}

export interface SutraRecord {
  id: string
  library: LibraryKind
  sourceVerification: SourceVerification
  sourceBatch?: string
  aliases: string[]
  title: string
  shortTitle: string
  dynasty: string
  translator: string
  sourceEdition: string
  sourceUrl?: string
  contentVersion?: string
  category: string
  description: string
  overview: SutraOverview
  juanCount: number
  passages: SutraPassage[]
  passageCount?: number
  characterCount?: number
  paginated?: boolean
  outline?: WorkOutlineItem[]
}

export interface WorkOutlineItem {
  key: string
  sequence: number
  endSequence: number
  title: string
  anchorId: string
  kind: 'body' | 'volume' | 'chapter' | 'section'
  level: number
  parentKey?: string
}

export interface SutraOverview {
  summary: string
  source: 'manual' | 'source' | 'ai'
  updatedAt: string
  reviewer: string
  note: string
}

export interface TermDefinition {
  term: string
  summary: string
  note: string
  sanskrit?: string
}

export interface FeatureCard {
  title: string
  text: string
  href: string
  label: string
}

export interface UpdateRecord {
  date: string
  type: '内容' | '功能' | '阅读' | '可信' | '后台' | '品牌' | '开发中'
  title: string
  summary: string
  impact: string
  href?: string
}

export interface SutraLibraryEntry {
  workId?: string
  contentVersion?: string
  library: LibraryKind
  sourceVerification: SourceVerification
  sourceBatch?: string
  section: string
  title: string
  volume: string
  dynasty: string
  translator: string
  status: string
  note: string
  available: boolean
  href?: string
}

export const siteConfig = {
  name: '观自在',
  description: '典籍对照阅读与 AI 白话辅助理解，强调原文、出处和可自行核验。',
  url: 'https://www.guanzizai.org',
  nav: [
    { href: '/sutras', label: '典藏' },
    { href: '/ask', label: '观自在问' },
    { href: '/about', label: '可信说明' },
    { href: '/contribute?kind=bug_report', label: 'Bug 反馈' },
  ],
}

/**
 * This repository deliberately ships no scripture, translation, generated
 * answer, catalog export, or production data. The record below is original
 * fictional text created only to demonstrate the reader UI.
 */
export const heartSutraPassages: SutraPassage[] = [
  {
    id: 'sample-line-1',
    anchorId: 'sample-work_j1_0001',
    seq: 1,
    juan: 1,
    sourceRef: '公开版原创样例 · 卷一 · 段 0001',
    original: '晨光入窗，读者展卷；先核出处，再观其义。',
    plain: '清晨翻开一页，先确认文本来源，再理解它表达的意思。',
    translationOrigin: 'manual',
    translationLabel: '原创样例释文',
    terms: ['出处', '原文'],
  },
  {
    id: 'sample-line-2',
    anchorId: 'sample-work_j1_0002',
    seq: 2,
    juan: 1,
    sourceRef: '公开版原创样例 · 卷一 · 段 0002',
    original: '原文为本，释文为助；有疑则返本复核。',
    plain: '阅读以原文为依据，辅助解释不能替代原文；有疑问时应回到来源核对。',
    translationOrigin: 'manual',
    translationLabel: '原创样例释文',
    terms: ['原文', '释文'],
  },
]

// The legacy export name is retained to avoid changing the reader interfaces.
// It refers only to the fictional sample in this source-available edition.
export const heartSutra: SutraRecord = {
  id: 'sample-work',
  library: '国学',
  sourceVerification: 'verified',
  aliases: ['sample', 'demo'],
  title: '公开版原创阅读样例',
  shortTitle: '《阅读样例》',
  dynasty: '当代',
  translator: '项目示例',
  sourceEdition: '本仓库原创虚构样例',
  category: '开发示例',
  description: '用于演示阅读器功能的原创虚构文本，不属于藏经阁内容。',
  overview: {
    summary: '这个最小样例仅用于演示原文优先、辅助释文、段落锚点和术语提示。',
    source: 'manual',
    updatedAt: '2026-07-25',
    reviewer: 'Guanzizai contributors',
    note: '公开仓库不包含真实书籍、译文、预生成回答或生产数据。',
  },
  juanCount: 1,
  passages: heartSutraPassages,
}

export const termDefinitions: TermDefinition[] = [
  {
    term: '出处',
    summary: '文本来源信息',
    note: '公开发布内容前，应记录版本、来源、许可和核验状态。',
  },
  {
    term: '原文',
    summary: '作为阅读依据的正文',
    note: '辅助释文和 AI 输出不能替代原文。',
  },
  {
    term: '释文',
    summary: '帮助理解的辅助文字',
    note: '应明确标记来源、生成方式和审核状态。',
  },
]

export const featureCards: FeatureCard[] = [
  {
    title: '对照阅读',
    text: '默认只看原文，需要时再打开释文或分节对照。',
    href: '/read/sample-work',
    label: '打开原创样例',
  },
  {
    title: '观自在问',
    text: '问答只在已发布文本范围内检索，并绑定可核验出处。',
    href: '/ask',
    label: '查看问答界面',
  },
  {
    title: '内容仓库',
    text: '公开版本只包含内容管理功能，不包含真实书籍或生产数据。',
    href: '/sutras',
    label: '查看空白目录',
  },
]

export const updateRecords: UpdateRecord[] = [
  {
    date: '2026-07-25',
    type: '可信',
    title: '发布不含内容数据的源码版本',
    summary: '公开版本保留产品功能和数据接口，移除真实书籍、译文、生成回答及生产数据。',
    impact: '仓库内仅保留原创虚构样例，部署者必须自行取得内容授权后再导入。',
    href: '/about',
  },
]

export const sutraLibraryEntries: SutraLibraryEntry[] = [
  {
    workId: heartSutra.id,
    library: heartSutra.library,
    sourceVerification: heartSutra.sourceVerification,
    section: heartSutra.category,
    title: heartSutra.title,
    volume: '2 个原创样例段落',
    dynasty: heartSutra.dynasty,
    translator: heartSutra.translator,
    status: '功能演示',
    note: '仅用于演示界面；本仓库不附带藏经阁书籍。',
    available: true,
    href: `/read/${heartSutra.id}`,
  },
]

export function sutraById(id: string) {
  const normalized = id.trim().toLowerCase()
  if (normalized === heartSutra.id.toLowerCase()) return heartSutra
  return heartSutra.aliases.includes(normalized) ? heartSutra : undefined
}

export function termByName(name: string) {
  return termDefinitions.find((item) => item.term === name)
}

export function passageNumber(seq: number) {
  return String(seq).padStart(2, '0')
}

export function countReadableCharacters(text: string) {
  return Array.from(text).filter((character) => /[\p{Letter}\p{Number}]/u.test(character)).length
}

export function sutraStats(sutra: SutraRecord) {
  const originalText = sutra.passages.map((passage) => passage.original).join('')
  const plainText = sutra.passages.map((passage) => passage.plain).join('')
  const originalCharCount = sutra.characterCount ?? countReadableCharacters(originalText)
  const plainCharCount = countReadableCharacters(plainText)
  const termCount = new Set(sutra.passages.flatMap((passage) => passage.terms)).size
  return {
    originalCharCount,
    plainCharCount,
    estimatedReadingMinutes: Math.max(1, Math.ceil(originalCharCount / 320)),
    passageCount: sutra.passageCount ?? sutra.passages.length,
    plainPassageCount: sutra.passages.filter((passage) => passage.plain.trim()).length,
    termCount,
  }
}

export function searchHeartSutra(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return heartSutra.passages.filter((passage) => (
    passage.original.toLowerCase().includes(q)
    || passage.plain.toLowerCase().includes(q)
    || passage.terms.some((term) => term.toLowerCase().includes(q))
  ))
}
