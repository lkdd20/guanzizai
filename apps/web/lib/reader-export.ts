import {
  type PassageReadingNote,
  type SutraPassage,
  type SutraRecord,
  type WorkOutlineItem,
} from './content'

export type ExportContent = 'original' | 'parallel' | 'annotated'
export type ExportPreset = 'classic' | 'compact' | 'study' | 'current'
export type ExportFont = 'readable' | 'classic'
export type ExportDirection = 'horizontal' | 'vertical'
export type ExportPaper = 'A4' | 'A5' | 'B5'
export type ExportMargin = 'narrow' | 'standard' | 'wide'
export type ExportDivider = 'none' | 'solid' | 'dashed'
export type ReaderExportFormat = 'print' | 'epub' | 'txt'

export interface ReaderExportSettings {
  content: ExportContent
  preset: ExportPreset
  font: ExportFont
  fontSize: number
  lineHeight: number
  direction: ExportDirection
  paper: ExportPaper
  margin: ExportMargin
  showCover: boolean
  showToc: boolean
  sectionBreaks: boolean
  showSegmentNumbers: boolean
  divider: ExportDivider
  annotationLines: 0 | 1 | 2 | 3
}

export interface ExportSection {
  key: string
  title: string
  kind: WorkOutlineItem['kind'] | 'juan'
  passages: SutraPassage[]
}

export interface ReaderExportDocument {
  sutra: SutraRecord
  passages: SutraPassage[]
  outline: WorkOutlineItem[]
}

export interface EpubEntry {
  name: string
  content: string
}

export const defaultReaderExportSettings: ReaderExportSettings = {
  content: 'original',
  preset: 'classic',
  font: 'readable',
  fontSize: 19,
  lineHeight: 1.9,
  direction: 'horizontal',
  paper: 'A4',
  margin: 'standard',
  showCover: true,
  showToc: true,
  sectionBreaks: true,
  showSegmentNumbers: false,
  divider: 'none',
  annotationLines: 0,
}

function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function htmlText(text: string) {
  return escapeXml(text).replaceAll('\n', '<br />')
}

function cleanTitle(title: string) {
  return title.replace(/[《》]/gu, '').trim()
}

function contributorLine(sutra: SutraRecord) {
  return `${sutra.dynasty} · ${sutra.translator}`
}

function sectionCandidates(outline: WorkOutlineItem[]) {
  const detailed = outline.filter((item) => item.kind === 'chapter' || item.kind === 'section')
  if (detailed.length) return detailed
  const volumes = outline.filter((item) => item.kind === 'volume')
  if (volumes.length) return volumes
  return outline.filter((item) => item.kind === 'body')
}

function bestOutlineItem(sequence: number, candidates: WorkOutlineItem[]) {
  return candidates
    .filter((item) => sequence >= item.sequence && sequence <= item.endSequence)
    .sort((left, right) => right.level - left.level || (left.endSequence - left.sequence) - (right.endSequence - right.sequence))[0]
}

export function buildExportSections(passages: SutraPassage[], outline: WorkOutlineItem[]) {
  const ordered = [...passages].sort((left, right) => left.seq - right.seq)
  const candidates = sectionCandidates(outline)
  const sections = new Map<string, ExportSection>()

  for (const passage of ordered) {
    const outlineItem = bestOutlineItem(passage.seq, candidates)
    const key = outlineItem?.key ?? `juan-${passage.juan || 1}`
    const section = sections.get(key) ?? {
      key,
      title: outlineItem?.title || (passage.juan > 1 ? `卷 ${passage.juan}` : '正文'),
      kind: outlineItem?.kind ?? 'juan',
      passages: [],
    }
    section.passages.push(passage)
    sections.set(key, section)
  }

  return [...sections.values()]
}

function translationLabel(passage: SutraPassage) {
  if (passage.translationLabel) return passage.translationLabel
  if (passage.translationOrigin === 'ai') return 'AI 白话辅助'
  if (passage.translationOrigin === 'licensed') return '授权白话译文'
  if (passage.translationOrigin === 'manual') return '人工白话译文'
  return '白话辅助'
}

function translationNotice(passages: SutraPassage[]) {
  const origins = new Set(passages.filter((passage) => passage.plain.trim()).map((passage) => passage.translationOrigin))
  if (!origins.size) return '本导出文件不含白话译文。'
  if (origins.has('ai')) return '文件含 AI 白话辅助，未经真人逐段审定的内容仅供理解，请以原文为准。'
  if (origins.has('licensed')) return '文件含站内当前公开的授权白话译文，引用时请同时核对相应许可。'
  return '文件含站内当前公开的白话译文，请以原文为准。'
}

function notesForPassage(passage: SutraPassage) {
  return passage.readingNotes ?? passage.enrichment?.readingNotes ?? []
}

function noteText(note: PassageReadingNote) {
  const term = note.termSimplified || note.termTraditional
  return `${term}${note.pinyin ? `（${note.pinyin}）` : ''}：${note.explanation}`
}

function renderAnnotationLines(count: number) {
  if (!count) return ''
  return `<div class="annotation-lines" aria-label="批注留白">${Array.from({ length: count }, () => '<span></span>').join('')}</div>`
}

function renderPassageHtml(passage: SutraPassage, settings: ReaderExportSettings) {
  const notes = notesForPassage(passage)
  const number = settings.showSegmentNumbers ? `<span class="passage-number">${passage.seq}</span>` : ''
  const translation = settings.content === 'parallel' && passage.plain.trim()
    ? `<div class="translation"><b>${escapeXml(translationLabel(passage))}</b><p>${htmlText(passage.plain)}</p></div>`
    : settings.content === 'parallel'
      ? '<div class="translation translation-empty"><b>白话辅助</b><p>本段暂未提供公开白话。</p></div>'
      : ''
  const noteList = settings.content === 'annotated' && notes.length
    ? `<aside class="notes"><b>阅读注释</b><ol>${notes.map((note) => `<li>${htmlText(noteText(note))}</li>`).join('')}</ol></aside>`
    : ''
  return `<article class="passage divider-${settings.divider}">
    ${number}<div class="original">${htmlText(passage.original)}</div>${translation}${noteList}${renderAnnotationLines(settings.annotationLines)}
  </article>`
}

function colophonHtml(document: ReaderExportDocument, settings: ReaderExportSettings) {
  const { sutra, passages } = document
  return `<section class="colophon">
    <h2>版本说明</h2>
    <dl>
      <div><dt>作品</dt><dd>${escapeXml(sutra.title)}</dd></div>
      <div><dt>底本</dt><dd>${escapeXml(sutra.sourceEdition || '站内公开版本')}</dd></div>
      <div><dt>内容</dt><dd>${settings.content === 'original' ? '仅原文' : settings.content === 'parallel' ? '原文与白话对照' : '原文与阅读注释'}</dd></div>
      <div><dt>生成</dt><dd>${escapeXml(new Date().toLocaleDateString('zh-CN'))} · 观自在阅读器</dd></div>
    </dl>
    <p>${escapeXml(translationNotice(passages))}</p>
    ${sutra.sourceUrl ? `<p>来源与许可详情：<a href="${escapeXml(sutra.sourceUrl)}">${escapeXml(sutra.sourceUrl)}</a></p>` : ''}
  </section>`
}

function tocHtml(sections: ExportSection[]) {
  return `<section class="toc"><h2>目录</h2><ol>${sections.map((section, index) => (
    `<li><a href="#section-${index + 1}"><span>${escapeXml(section.title)}</span><small>${section.passages.length} 段</small></a></li>`
  )).join('')}</ol></section>`
}

export function buildPrintHtml(document: ReaderExportDocument, settings: ReaderExportSettings) {
  const { sutra, passages } = document
  const printPaperMargins: Record<ExportMargin, string> = { narrow: '12mm', standard: '18mm', wide: '25mm' }
  const printFontStacks: Record<ExportFont, string> = {
    readable: '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    classic: '"FZKai-Z03", "Kaiti SC", "STKaiti", "Noto Serif CJK SC", serif',
  }
  const sections = buildExportSections(passages, document.outline)
  const title = `${cleanTitle(sutra.shortTitle)} · 排印版`
  const sectionHtml = sections.map((section, index) => `<section class="book-section${settings.sectionBreaks ? ' page-break' : ''}" id="section-${index + 1}">
    <header class="section-title"><small>${String(index + 1).padStart(2, '0')}</small><h2>${escapeXml(section.title)}</h2><span>${section.passages.length} 段</span></header>
    <div class="passage-list">${section.passages.map((passage) => renderPassageHtml(passage, settings)).join('')}</div>
  </section>`).join('')
  const directionClass = settings.direction === 'vertical' ? 'direction-vertical' : 'direction-horizontal'
  const originalCharacterCount = passages.reduce((total, passage) => total + [...passage.original].length, 0)
  const documentDensityClass = passages.length > 24 || originalCharacterCount > 4000
    ? 'document-expansive'
    : 'document-compact'

  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(title)}</title>
  <style>
    @page { size: ${settings.paper}; margin: ${printPaperMargins[settings.margin]}; }
    * { box-sizing: border-box; }
    html { color: #241b13; background: #eee9df; }
    body { margin: 0; font-family: ${printFontStacks[settings.font]}; background: white; }
    .print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; border-bottom: 1px solid #ddd3c5; background: rgba(255,255,255,.96); font-family: system-ui, sans-serif; }
    .print-toolbar p { margin: 0; color: #6f6255; font-size: 13px; }
    .print-toolbar button { min-height: 38px; border: 0; border-radius: 5px; background: #8b2f27; color: #fff; padding: 0 18px; cursor: pointer; }
    main { width: min(100%, 820px); margin: 0 auto; padding: 32px 34px 60px; }
    .cover { min-height: 82vh; display: grid; align-content: center; justify-items: center; text-align: center; break-after: page; }
    .cover::before { content: "观自在 · 典藏"; color: #8b2f27; font-size: 12px; letter-spacing: .16em; }
    .cover h1 { max-width: 12em; margin: 38px 0 18px; font-size: 38px; font-weight: 500; line-height: 1.35; }
    .cover p { margin: 0; color: #776858; font-size: 15px; }
    .cover .cover-rule { width: 36px; margin: 32px auto 0; border-top: 2px solid #8b2f27; }
    .toc { break-after: page; }
    .toc h2, .colophon h2 { margin: 0 0 28px; font-size: 26px; font-weight: 500; }
    .toc ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 36px; }
    .toc li { break-inside: avoid; border-bottom: 1px dotted #cfc2b2; }
    .toc a { display: flex; justify-content: space-between; gap: 12px; color: inherit; padding: 8px 0; text-decoration: none; }
    .toc small { color: #8c7d6c; white-space: nowrap; }
    .book-section.page-break { break-before: page; }
    .book-section:first-of-type { break-before: auto; }
    .section-title { display: flex; align-items: baseline; gap: 12px; margin: 0 0 28px; padding-bottom: 10px; border-bottom: 1px solid #b9a58c; }
    .section-title small, .section-title span { color: #927c63; font-size: 12px; }
    .section-title h2 { flex: 1; margin: 0; font-size: 25px; font-weight: 500; }
    .passage { position: relative; break-inside: avoid; margin: 0 0 1.2em; padding: 0 0 1.2em; }
    .passage.divider-solid { border-bottom: 1px solid #d8cec0; }
    .passage.divider-dashed { border-bottom: 1px dashed #c8b9a6; }
    .passage-number { position: absolute; right: calc(100% + 8px); top: .55em; color: #a08e79; font: 10px/1 system-ui, sans-serif; }
    .original { font-size: ${settings.fontSize}px; line-height: ${settings.lineHeight}; text-align: justify; }
    .translation { margin-top: .75em; border-left: 2px solid #b49770; padding: .1em 0 .1em 1em; color: #55483b; }
    .translation b, .notes b { color: #8b2f27; font: 600 11px/1.5 system-ui, sans-serif; }
    .translation p { margin: .25em 0 0; font-size: ${Math.max(13, settings.fontSize - 3)}px; line-height: ${Math.max(1.6, settings.lineHeight - 0.1)}; }
    .translation-empty { color: #8a8177; }
    .notes { margin-top: .8em; border: 1px solid #ded4c6; padding: 10px 13px; background: #fbfaf7; }
    .notes ol { margin: 6px 0 0; padding-left: 1.4em; }
    .notes li { margin: .25em 0; font-size: ${Math.max(12, settings.fontSize - 5)}px; line-height: 1.65; }
    .annotation-lines { display: grid; gap: 14px; margin-top: 13px; }
    .annotation-lines span { display: block; height: 12px; border-bottom: 1px dashed #cbbdab; }
    .colophon { break-before: page; color: #65594d; }
    .colophon dl { margin: 0; }
    .colophon dl div { display: grid; grid-template-columns: 5em 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e3dbd0; }
    .colophon dt { color: #988875; }
    .colophon dd { margin: 0; }
    .colophon p { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
    .colophon a { color: inherit; }
    .direction-vertical .book-section { min-height: 70vh; }
    .direction-vertical .passage-list { writing-mode: vertical-rl; text-orientation: upright; max-width: 100%; min-height: 68vh; overflow: visible; }
    .direction-vertical .passage { margin: 0 0 0 1.8em; padding: 0 0 0 1.8em; }
    .direction-vertical .passage.divider-solid { border: 0; border-left: 1px solid #d8cec0; }
    .direction-vertical .passage.divider-dashed { border: 0; border-left: 1px dashed #c8b9a6; }
    .direction-vertical .translation { margin: 0 .75em 0 0; border: 0; border-top: 2px solid #b49770; padding: 1em .1em 0; }
    .direction-vertical .annotation-lines { display: none; }
    @media screen and (min-width: 900px) {
      .direction-vertical.document-expansive main { width: min(1480px, calc(100vw - 48px)); padding-inline: clamp(24px, 3vw, 48px); }
      .direction-vertical.document-expansive .book-section { width: 100%; }
      .direction-vertical.document-expansive .passage-list { width: 100%; height: min(760px, calc(100vh - 150px)); min-height: 580px; overflow-x: auto; overflow-y: hidden; border-block: 1px solid #e4dbcf; padding: 32px clamp(24px, 3vw, 46px); scrollbar-color: #b9a58c transparent; scrollbar-width: thin; }
    }
    @media print {
      html, body { background: #fff; }
      .print-toolbar { display: none; }
      main { width: auto; max-width: none; padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
    @media screen and (max-width: 640px) {
      main { padding: 22px 18px 44px; }
      .print-toolbar { align-items: flex-start; flex-direction: column; }
      .print-toolbar button { width: 100%; }
      .toc ol { columns: 1; }
      .cover h1 { font-size: 31px; }
    }
  </style>
</head>
<body class="${directionClass} ${documentDensityClass}">
  <div class="print-toolbar"><p>这是打印预览。请在浏览器打印面板选择打印机，或选择“存储为 PDF”。页码和浏览器页眉可在打印面板中控制。</p><button type="button" onclick="window.print()">打印 / 保存 PDF</button></div>
  <main>
    ${settings.showCover ? `<section class="cover"><h1>${escapeXml(sutra.title)}</h1><p>${escapeXml(contributorLine(sutra))}</p><span class="cover-rule"></span></section>` : ''}
    ${settings.showToc && sections.length > 1 ? tocHtml(sections) : ''}
    ${sectionHtml}
    ${colophonHtml(document, settings)}
  </main>
</body>
</html>`
}

export function buildStructuredText(document: ReaderExportDocument, settings: ReaderExportSettings) {
  const { sutra, passages } = document
  const sections = buildExportSections(passages, document.outline)
  const lines = [
    sutra.title,
    contributorLine(sutra),
    sutra.sourceEdition ? `底本：${sutra.sourceEdition}` : '',
    '',
  ].filter((line, index) => Boolean(line) || index === 3)

  if (settings.showToc && sections.length > 1) {
    lines.push('目录', ...sections.map((section, index) => `${index + 1}. ${section.title}`), '')
  }

  for (const section of sections) {
    lines.push(`【${section.title}】`, '')
    for (const passage of section.passages) {
      const prefix = settings.showSegmentNumbers ? `[${passage.seq}] ` : ''
      lines.push(`${prefix}${passage.original}`)
      if (settings.content === 'parallel') {
        lines.push(passage.plain.trim() ? `${translationLabel(passage)}：${passage.plain}` : '白话辅助：本段暂未提供公开白话。')
      }
      if (settings.content === 'annotated') {
        const notes = notesForPassage(passage)
        if (notes.length) lines.push(...notes.map((note) => `注：${noteText(note)}`))
      }
      if (settings.annotationLines) lines.push(...Array.from({ length: settings.annotationLines }, () => '--------------------------------'))
      lines.push('')
    }
  }

  lines.push('版本说明', translationNotice(passages), `生成：${new Date().toLocaleDateString('zh-CN')} · 观自在阅读器`)
  if (sutra.sourceUrl) lines.push(`来源与许可详情：${sutra.sourceUrl}`)
  return lines.join('\n')
}

function sectionXhtml(section: ExportSection, index: number, settings: ReaderExportSettings) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-Hans">
  <head><title>${escapeXml(section.title)}</title><link rel="stylesheet" type="text/css" href="styles.css" /></head>
  <body class="${settings.direction === 'vertical' ? 'vertical' : 'horizontal'}">
    <section><h1><small>${String(index + 1).padStart(2, '0')}</small>${escapeXml(section.title)}</h1>${section.passages.map((passage) => renderPassageHtml(passage, settings)).join('')}</section>
  </body>
</html>`
}

export function buildEpubEntries(document: ReaderExportDocument, settings: ReaderExportSettings) {
  const { sutra, passages } = document
  const epubFontStacks: Record<ExportFont, string> = {
    readable: '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    classic: '"FZKai-Z03", "Kaiti SC", "STKaiti", "Noto Serif CJK SC", serif',
  }
  const sections = buildExportSections(passages, document.outline)
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const title = `${cleanTitle(sutra.shortTitle)} · ${settings.content === 'original' ? '原文版' : settings.content === 'parallel' ? '对照版' : '注释版'}`
  const sectionEntries = sections.map((section, index) => ({
    name: `OEBPS/section-${index + 1}.xhtml`,
    content: sectionXhtml(section, index, settings),
  }))
  const manifest = sections.map((_, index) => `<item id="section-${index + 1}" href="section-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')
  const spine = sections.map((_, index) => `<itemref idref="section-${index + 1}"/>`).join('\n    ')
  const nav = sections.map((section, index) => `<li><a href="section-${index + 1}.xhtml">${escapeXml(section.title)}</a></li>`).join('')
  const font = epubFontStacks[settings.font]

  return [
    { name: 'mimetype', content: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
    {
      name: 'OEBPS/content.opf',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">guanzizai-${escapeXml(sutra.id)}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>zh-Hans</dc:language><dc:creator>${escapeXml(contributorLine(sutra))}</dc:creator><meta property="dcterms:modified">${modified}</meta></metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="style" href="styles.css" media-type="text/css"/>${manifest}</manifest>
  <spine><itemref idref="cover"/>${spine}</spine>
</package>`,
    },
    {
      name: 'OEBPS/nav.xhtml',
      content: `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-Hans"><head><title>目录</title><link rel="stylesheet" type="text/css" href="styles.css" /></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>${nav}</ol></nav></body></html>`,
    },
    {
      name: 'OEBPS/cover.xhtml',
      content: `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh-Hans"><head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="styles.css" /></head><body><section class="cover"><small>观自在 · 典藏</small><h1>${escapeXml(sutra.title)}</h1><p>${escapeXml(contributorLine(sutra))}</p><p>${escapeXml(translationNotice(passages))}</p></section></body></html>`,
    },
    {
      name: 'OEBPS/styles.css',
      content: `body{color:#241b13;font-family:${font};font-size:${settings.fontSize}px;line-height:${settings.lineHeight};padding:1.2em;}body.vertical{writing-mode:vertical-rl;text-orientation:upright;}h1{font-size:1.45em;font-weight:500;border-bottom:1px solid #b9a58c;padding-bottom:.5em;}h1 small{color:#927c63;font-size:.5em;margin-right:1em}.cover{min-height:80vh;display:flex;flex-direction:column;justify-content:center;text-align:center}.passage{margin:0 0 1.2em;padding-bottom:1em;break-inside:avoid}.divider-solid{border-bottom:1px solid #d8cec0}.divider-dashed{border-bottom:1px dashed #c8b9a6}.passage-number{color:#927c63;font-size:.6em;margin-right:.6em}.translation{border-left:2px solid #b49770;color:#55483b;margin-top:.7em;padding-left:1em}.translation b,.notes b{color:#8b2f27;font-size:.65em}.translation p{margin:.3em 0}.notes{background:#fbfaf7;border:1px solid #ded4c6;margin-top:.8em;padding:.7em}.annotation-lines span{display:block;height:1em;border-bottom:1px dashed #cbbdab;margin-top:.5em}`,
    },
    ...sectionEntries,
  ] satisfies EpubEntry[]
}

function getCrcTable() {
  const cacheHolder = getCrcTable as typeof getCrcTable & { cache?: Uint32Array }
  if (cacheHolder.cache) return cacheHolder.cache
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  cacheHolder.cache = table
  return table
}

function crc32(bytes: Uint8Array) {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function makeStoredZip(entries: EpubEntry[]) {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const contentBytes = encoder.encode(entry.content)
    const checksum = crc32(contentBytes)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, contentBytes.length, true)
    localView.setUint32(22, contentBytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localHeader.set(nameBytes, 30)
    localParts.push(localHeader, contentBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, contentBytes.length, true)
    centralView.setUint32(24, contentBytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, localOffset, true)
    centralHeader.set(nameBytes, 46)
    centralParts.push(centralHeader)
    localOffset += localHeader.length + contentBytes.length
  }

  const centralDirectory = concatBytes(centralParts)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralDirectory.length, true)
  endView.setUint32(16, localOffset, true)
  return concatBytes([...localParts, centralDirectory, endRecord])
}

export function buildReaderExportPayload(
  format: ReaderExportFormat,
  document: ReaderExportDocument,
  settings: ReaderExportSettings,
) {
  if (format === 'print') return buildPrintHtml(document, settings)
  if (format === 'txt') return buildStructuredText(document, settings)
  return makeStoredZip(buildEpubEntries(document, settings)).slice().buffer as ArrayBuffer
}

export function safeExportFilename(sutra: SutraRecord, suffix: string) {
  const base = cleanTitle(sutra.shortTitle || sutra.title).replace(/[\\/:*?"<>|\s]+/gu, '-') || sutra.id
  return `guanzizai-${base}-${suffix}`
}
