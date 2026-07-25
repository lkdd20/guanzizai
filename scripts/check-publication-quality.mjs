#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const punctuationPattern = /[，。！？；：、“”‘’（）《》]/u

function usage() {
  return 'Usage: node scripts/check-publication-quality.mjs <work.json> [--json]'
}

export function analyzeWork(work) {
  const originals = work.passages.map((passage) => String(passage.original ?? ''))
  const characters = Array.from(originals.join('\n'))
  const punctuationCount = characters.filter((character) => punctuationPattern.test(character)).length
  const suspiciousGlyphCount = characters.filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return character === '\uFFFD' || character === '\u25A1' || (codePoint >= 0xe000 && codePoint <= 0xf8ff)
  }).length
  const longPassageCount = originals.filter((original) => Array.from(original).length > 1000).length
  const punctuationRatio = characters.length ? punctuationCount / characters.length : 0
  const reasons = []

  if (characters.length >= 1000 && punctuationRatio < 0.002) reasons.push('punctuation-density-too-low')
  if (suspiciousGlyphCount > Math.max(10, characters.length * 0.001)) reasons.push('suspicious-glyphs')
  if (longPassageCount > Math.max(5, originals.length * 0.25)) reasons.push('too-many-long-passages')

  return {
    id: work.sutra.id,
    title: work.sutra.title_zh,
    characters: characters.length,
    punctuationCount,
    punctuationRatio,
    suspiciousGlyphCount,
    longPassageCount,
    passageCount: originals.length,
    publishable: reasons.length === 0,
    reasons,
  }
}

async function main() {
  const file = process.argv[2]
  if (!file || file.startsWith('--')) throw new Error(usage())
  const report = analyzeWork(JSON.parse(await readFile(resolve(file), 'utf8')))
  console.log(JSON.stringify(report, null, process.argv.includes('--json') ? 2 : 0))
  if (!report.publishable) process.exitCode = 2
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
