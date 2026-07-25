export function formatAskAnswerMarkdown(value: string) {
  const normalized = value
    .replace(/\r\n?/gu, '\n')
    .trim()
    .replace(/^\*\*([^*\n]{4,80})\*\*\s*\n?/u, '## $1\n\n')
    .replace(/^(#{2,3}\s+[^\n]+)\n(?=\S)/gmu, '$1\n\n')
  if (!normalized) return ''

  return normalized
    .split(/\n{2,}/u)
    .flatMap((block) => formatMarkdownBlock(block))
    .filter(Boolean)
    .join('\n\n')
}

export function removeEmbeddedEvidenceMarkdown(value: string) {
  const evidenceHeading = /^#{2,3}\s*(?:站内)?(?:原文|引文|引原文|证据|出处|引用|核验边界|证据边界)/u
  const blocks = value.split(/\n{2,}/u)
  const kept: string[] = []
  let skipSection = false
  for (const block of blocks) {
    const trimmed = block.trim()
    if (/^#{2,3}\s/u.test(trimmed)) {
      skipSection = evidenceHeading.test(trimmed)
      if (skipSection) continue
    }
    if (skipSection || /^>/u.test(trimmed)) continue
    kept.push(trimmed.replace(/\s*\[\d+\]/gu, ''))
  }
  return kept.filter(Boolean).join('\n\n')
}

export interface AskInlineCitationSource {
  id?: string
  ref: string
  quote: string
  href: string
}

export function resolveVerifiedCitationMarkers(value: string, sources: AskInlineCitationSource[]) {
  const answer = removeEmbeddedEvidenceMarkdown(formatAskAnswerMarkdown(value))
  const sourceById = new Map(sources.flatMap((source) => source.id ? [[source.id, source] as const] : []))
  const used = new Set<string>()
  let citationCount = 0
  const resolvedBlocks = answer.split(/\n{2,}/u).flatMap((block) => {
    const markerIds = Array.from(block.matchAll(/\[\[cite:([a-zA-Z0-9_-]{4,180})\]\]/gu), (match) => match[1])
    const cleanBlock = block
      .replace(/\s*\[\[cite:[^\]\r\n]+\]\]\s*/gu, '')
      .replace(/\s*\[\[no_evidence\]\]\s*/gu, '')
      .replace(/[ \t]{2,}/gu, ' ')
      .trim()
    const citationBlocks = markerIds.flatMap((id) => {
      const source = sourceById.get(id)
      if (!source || used.has(id) || !/^\/(?!\/)/u.test(source.href)) return []
      const excerpt = inlineCitationExcerpt(source.quote)
      if (!excerpt || !source.quote.includes(excerpt)) return []
      used.add(id)
      citationCount += 1
      return [`${formatInlineCitationBlockquote(excerpt, excerpt.length < source.quote.trim().length)}\n>\n> [${source.ref}](${source.href})`]
    })
    return [...(cleanBlock ? [cleanBlock] : []), ...citationBlocks]
  })

  return {
    answer: resolvedBlocks.join('\n\n').replace(/\n{3,}/gu, '\n\n').trim(),
    citationCount,
    citedSourceIds: [...used],
  }
}

export function inlineCitationExcerpt(sourceQuote: string, maxLength = 96) {
  const quote = sourceQuote.trim()
  if (!quote) return ''
  if (quote.length <= maxLength) return quote

  const candidate = quote.slice(0, maxLength)
  const punctuation = Math.max(
    candidate.lastIndexOf('。'),
    candidate.lastIndexOf('！'),
    candidate.lastIndexOf('？'),
    candidate.lastIndexOf('；'),
  )
  return punctuation >= 28 ? candidate.slice(0, punctuation + 1) : candidate
}

export function formatInlineCitationBlockquote(excerpt: string, truncated = false) {
  const quotedExcerpt = excerpt.replace(/\r\n?/gu, '\n').replace(/\n/gu, '\n> ')
  return `> **原文片段**：“${quotedExcerpt}${truncated ? '……' : ''}”`
}

export function addVerifiedInlineCitations(value: string, sources: AskInlineCitationSource[], maxCitations = 1) {
  const answer = removeEmbeddedEvidenceMarkdown(formatAskAnswerMarkdown(value))
  const blocks = answer.split(/\n{2,}/u).filter(Boolean)
  if (blocks.length < 2 || !sources.length) return answer

  const citations = sources.slice(0, Math.max(0, Math.min(2, maxCitations))).flatMap((source) => {
    const excerpt = inlineCitationExcerpt(source.quote)
    if (!excerpt || !source.quote.includes(excerpt) || !/^\/(?!\/)/u.test(source.href)) return []
    return [`${formatInlineCitationBlockquote(excerpt, excerpt.length < source.quote.trim().length)}\n>\n> [${source.ref}](${source.href})`]
  })
  if (!citations.length) return answer

  const result = [...blocks]
  result.splice(Math.min(2, result.length), 0, citations[0])
  if (citations[1]) result.splice(Math.min(5, result.length), 0, citations[1])
  return result.join('\n\n')
}

function formatMarkdownBlock(block: string) {
  const trimmed = block.trim()
  if (!trimmed) return []
  if (/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|\||```)/u.test(trimmed)) return [trimmed]

  const paragraph = trimmed.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
  if (paragraph.length <= 110) return [paragraph]
  const sentences = paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [paragraph]
  const paragraphs: string[] = []
  let current = ''
  let sentenceCount = 0
  for (const sentence of sentences) {
    if (current && (current.length + sentence.length > 100 || sentenceCount >= 2)) {
      paragraphs.push(current)
      current = ''
      sentenceCount = 0
    }
    current += sentence
    sentenceCount += 1
  }
  if (current) paragraphs.push(current)
  return paragraphs
}
