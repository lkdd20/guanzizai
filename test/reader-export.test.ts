import { describe, expect, it } from 'vitest'

import {
  buildEpubEntries,
  buildExportSections,
  buildPrintHtml,
  buildReaderExportPayload,
  buildStructuredText,
  defaultReaderExportSettings,
  makeStoredZip,
} from '../apps/web/lib/reader-export'
import { type SutraPassage, type SutraRecord, type WorkOutlineItem } from '../apps/web/lib/content'

const passages: SutraPassage[] = [
  {
    id: 'p-1', anchorId: 'p-1', seq: 1, juan: 1, sourceRef: '卷一',
    original: '第一段<&', plain: '第一段白话', translationOrigin: 'ai', terms: [],
    readingNotes: [{ termTraditional: '第一', termSimplified: '第一', pinyin: 'dì yī', explanation: '次序之始。' }],
  },
  {
    id: 'p-2', anchorId: 'p-2', seq: 2, juan: 1, sourceRef: '卷一',
    original: '第二段', plain: '', terms: [],
  },
  {
    id: 'p-3', anchorId: 'p-3', seq: 3, juan: 2, sourceRef: '卷二',
    original: '第三段', plain: '第三段白话', translationOrigin: 'manual', terms: [],
  },
]

const outline: WorkOutlineItem[] = [
  { key: 'v1', sequence: 1, endSequence: 2, title: '卷一', anchorId: 'v1', kind: 'volume', level: 0 },
  { key: 'c1', sequence: 1, endSequence: 2, title: '第一篇', anchorId: 'c1', kind: 'chapter', level: 1, parentKey: 'v1' },
  { key: 'v2', sequence: 3, endSequence: 3, title: '卷二', anchorId: 'v2', kind: 'volume', level: 0 },
  { key: 'c2', sequence: 3, endSequence: 3, title: '第二篇', anchorId: 'c2', kind: 'chapter', level: 1, parentKey: 'v2' },
]

const sutra: SutraRecord = {
  id: 'example', library: '国学', sourceVerification: 'unverified', aliases: [],
  title: '《测试古籍》', shortTitle: '测试古籍', dynasty: '清', translator: '某氏',
  sourceEdition: '固定修订测试版', sourceUrl: 'https://example.com/source', category: '笔记',
  description: '', overview: { summary: '', source: 'manual', updatedAt: '', reviewer: '', note: '' },
  juanCount: 2, passages, outline,
}

describe('reader export', () => {
  it('groups passages into the most detailed ordered outline sections', () => {
    const sections = buildExportSections([...passages].reverse(), outline)
    expect(sections.map((section) => section.title)).toEqual(['第一篇', '第二篇'])
    expect(sections[0].passages.map((passage) => passage.seq)).toEqual([1, 2])
  })

  it('builds escaped print HTML with cover, toc, translations and annotation lines', () => {
    const html = buildPrintHtml(
      { sutra, passages, outline },
      { ...defaultReaderExportSettings, content: 'parallel', showSegmentNumbers: true, annotationLines: 2 },
    )
    expect(html).toContain('测试古籍')
    expect(html).toContain('第一篇')
    expect(html).toContain('第一段&lt;&amp;')
    expect(html).not.toContain('第一段<&')
    expect(html).toContain('AI 白话辅助')
    expect(html.match(/annotation-lines/g)?.length).toBeGreaterThan(1)
  })

  it('uses a wide screen preview only for expansive vertical documents', () => {
    const shortHtml = buildPrintHtml(
      { sutra, passages, outline },
      { ...defaultReaderExportSettings, direction: 'vertical' },
    )
    const longPassages = Array.from({ length: 25 }, (_, index) => ({
      ...passages[index % passages.length],
      id: `long-${index + 1}`,
      anchorId: `long-${index + 1}`,
      seq: index + 1,
    }))
    const longHtml = buildPrintHtml(
      { sutra: { ...sutra, passages: longPassages }, passages: longPassages, outline: [] },
      { ...defaultReaderExportSettings, direction: 'vertical' },
    )
    expect(shortHtml).toContain('class="direction-vertical document-compact"')
    expect(longHtml).toContain('class="direction-vertical document-expansive"')
    expect(longHtml).toContain('width: min(1480px, calc(100vw - 48px))')
  })

  it('keeps structure and notes in the plain text export', () => {
    const text = buildStructuredText(
      { sutra, passages, outline },
      { ...defaultReaderExportSettings, content: 'annotated', showSegmentNumbers: true },
    )
    expect(text).toContain('目录')
    expect(text).toContain('【第一篇】')
    expect(text).toContain('[1] 第一段<&')
    expect(text).toContain('注：第一（dì yī）：次序之始。')
    expect(text).toContain('来源与许可详情：https://example.com/source')
  })

  it('creates an EPUB with cover, navigation and one XHTML file per section', () => {
    const entries = buildEpubEntries(
      { sutra, passages, outline },
      { ...defaultReaderExportSettings, content: 'parallel' },
    )
    expect(entries[0]).toEqual({ name: 'mimetype', content: 'application/epub+zip' })
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/cover.xhtml')
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/section-1.xhtml')
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/section-2.xhtml')
    expect(entries.find((entry) => entry.name === 'OEBPS/nav.xhtml')?.content).toContain('第二篇')
    expect(makeStoredZip(entries).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]))
  })

  it('builds the same payloads used by the packaged browser worker', () => {
    const document = { sutra, passages, outline }
    const printPayload = buildReaderExportPayload('print', document, defaultReaderExportSettings)
    const textPayload = buildReaderExportPayload('txt', document, defaultReaderExportSettings)
    const epubPayload = buildReaderExportPayload('epub', document, defaultReaderExportSettings)
    expect(printPayload).toContain('<title>测试古籍 · 排印版</title>')
    expect(textPayload).toContain('【第一篇】')
    expect(new Uint8Array(epubPayload as ArrayBuffer).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]))
  })
})
