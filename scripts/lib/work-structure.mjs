import { createHash } from 'node:crypto'

const volumePattern = /^(?:第)?([一二三四五六七八九十百千廿卅〇零两0-9]+)卷|^卷([一二三四五六七八九十百千廿卅〇零两0-9]+)/u
const terminalPunctuation = /[。！？；：,.!?;:]$/u

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function firstLine(text) {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

function headingCandidate(passage, workTitle) {
  const line = firstLine(passage.original)
  if (!line || line === workTitle || line.length > 48 || terminalPunctuation.test(line)) return null
  const volume = line.match(volumePattern)
  if (volume) return { kind: 'volume', title: line, volumeLabel: volume[0] }
  if (passage.original.includes('\n') && line.length <= 32) return { kind: 'chapter', title: line }
  if (passage.original.length <= 32) return { kind: 'chapter', title: line }
  return null
}

export function deriveWorkStructure(work) {
  const passages = work.passages
  const headings = passages.flatMap((passage) => {
    const candidate = headingCandidate(passage, work.sutra.title_zh)
    return candidate ? [{ ...candidate, sequence: passage.seq }] : []
  })
  const nodes = []
  let currentVolume = null
  let volumeNumber = 0
  let chapterNumber = 0

  for (const heading of headings) {
    if (heading.kind === 'volume') {
      volumeNumber += 1
      chapterNumber = 0
      currentVolume = `volume-${volumeNumber}`
      nodes.push({
        key: currentVolume,
        kind: 'volume',
        level: 1,
        parentKey: null,
        title: heading.title,
        juan: volumeNumber,
        sequence: heading.sequence,
      })
      continue
    }
    chapterNumber += 1
    nodes.push({
      key: `${currentVolume ?? 'root'}-chapter-${chapterNumber}`,
      kind: 'chapter',
      level: currentVolume ? 2 : 1,
      parentKey: currentVolume,
      title: heading.title,
      juan: Math.max(1, volumeNumber),
      sequence: heading.sequence,
    })
  }

  if (!nodes.length || nodes[0].sequence > passages[0]?.seq) {
    nodes.unshift({
      key: 'body',
      kind: 'body',
      level: 1,
      parentKey: null,
      title: '正文',
      juan: 1,
      sequence: passages[0]?.seq ?? 1,
    })
  }

  return nodes.map((node, index) => {
    const nextAtSameOrHigherLevel = nodes.slice(index + 1).find((candidate) => candidate.level <= node.level)
    const endSequence = (nextAtSameOrHigherLevel?.sequence ?? ((passages.at(-1)?.seq ?? node.sequence) + 1)) - 1
    const sectionPassages = passages.filter((passage) => passage.seq >= node.sequence && passage.seq <= endSequence)
    return {
      ...node,
      endSequence,
      contentHash: sha256(sectionPassages.map((passage) => passage.original).join('')),
      characterCount: sectionPassages.reduce((sum, passage) => sum + passage.char_count, 0),
    }
  })
}

export function sectionForPassage(structure, sequence) {
  return [...structure]
    .reverse()
    .find((section) => sequence >= section.sequence && sequence <= section.endSequence)
    ?? structure[0]
}
