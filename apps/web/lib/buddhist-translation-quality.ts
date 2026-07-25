import OpenCC from 'opencc-js'

import { inspectTranslation } from './translation-quality'

const toHans = OpenCC.Converter({ from: 'tw', to: 'cn' })
const MODEL_META = /作为(?:一个)?AI|以下是(?:白话)?翻译|无法翻译|希望能帮到|仅供参考|这段用现代汉语直述为/u
const MECHANICAL_ARTIFACT = /在是至|因这(?:[，。；：]|说|言|疑|故)|何所以/u
const MANTRA_MARKER = /咒曰|真言(?:曰|\s|$)|陀羅尼|陀罗尼|莎婆訶|薩婆訶|萨婆诃|唵[。．\s]/u
const MANTRA_INTERPRETATION = /意(?:为|為)|意思是|去吧|到彼岸|成就觉悟|覺悟圓成|觉悟圆成/u
const EXPLANATORY_ADDITIONS = [
  { target: /无自性|沒有自性|没有自性/u, source: /無自性|无自性|自性/u, label: '无自性' },
  { target: /固定(?:的)?(?:自性|实体)|獨立不變|独立不变/u, source: /固定|自性|實體|实体|獨立|独立/u, label: '固定实体/自性' },
  { target: /因緣所生|因缘所生|緣起|缘起/u, source: /因緣|因缘|緣起|缘起/u, label: '因缘/缘起' },
  { target: /能證|能证|所證|所证/u, source: /能證|能证|所證|所证/u, label: '能证/所证' },
]

export interface GeneratedTranslationSegment {
  index: number
  translation: string
}

export interface BuddhistGeneratedTranslationIssue {
  code: string
  message: string
}

export interface BuddhistTranslationInspectionOptions {
  allowUnchangedSource?: boolean
  allowSourceCopy?: boolean
}

function normalize(value: string) {
  return toHans(value).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '')
}

function ngramRetention(source: string, translation: string, size = 4) {
  const sourceText = normalize(source)
  const targetText = normalize(translation)
  if (sourceText.length < 80 || targetText.length < 80) return 0
  const sourceNgrams = new Set<string>()
  for (let index = 0; index <= sourceText.length - size; index += 1) sourceNgrams.add(sourceText.slice(index, index + size))
  let retained = 0
  let total = 0
  for (let index = 0; index <= targetText.length - size; index += 1) {
    if (sourceNgrams.has(targetText.slice(index, index + size))) retained += 1
    total += 1
  }
  return total ? retained / total : 0
}

function characterRetention(source: string, translation: string) {
  const sourceCharacters = [...normalize(source)]
  if (!sourceCharacters.length) return 1
  const targetCharacters = new Set([...normalize(translation)])
  return sourceCharacters.filter((character) => targetCharacters.has(character)).length / sourceCharacters.length
}

export function isBuddhistStructuralHeading(value: string) {
  const text = value.trim()
  if (!text || text === '正文') return text === '正文'
  if ([...text].length > 64 || /[。！？；：\n]/u.test(text)) return false
  return /(?:品|分|卷|序)第[0-9零〇一二三四五六七八九十百千]+(?:[『「].*[』」])?$/u.test(text)
}

export function isBuddhistMantraText(value: string) {
  return MANTRA_MARKER.test(value)
}

export function isBuddhistNameEnumeration(value: string) {
  return (value.match(/、/gu) ?? []).length >= 10
}

export function inspectGeneratedBuddhistTranslation(
  original: string,
  translation: string,
  options: BuddhistTranslationInspectionOptions = {},
) {
  const generic = inspectTranslation(original, translation)
  const genericIssues = options.allowUnchangedSource
    ? generic.issues.filter((code) => code !== 'unchanged_source')
    : generic.issues
  const issues: BuddhistGeneratedTranslationIssue[] = genericIssues.map((code) => ({ code, message: code }))
  if (MODEL_META.test(translation)) issues.push({ code: 'model_meta_text', message: '包含模型说明或流程文案' })
  if (MECHANICAL_ARTIFACT.test(translation)) issues.push({ code: 'mechanical_rewrite_artifact', message: '包含机械替换残留' })
  const copyRatio = ngramRetention(original, translation)
  if (copyRatio >= 0.82 && !options.allowSourceCopy) {
    issues.push({ code: 'source_copy_rewrite', message: `四字片段保留率 ${copyRatio.toFixed(3)}` })
  }
  for (const concept of EXPLANATORY_ADDITIONS) {
    if (concept.target.test(translation) && !concept.source.test(original)) {
      issues.push({ code: 'added_interpretive_concept', message: `原文未直接表达“${concept.label}”` })
    }
  }
  if (MANTRA_MARKER.test(original)) {
    if (MANTRA_INTERPRETATION.test(translation)) issues.push({ code: 'mantra_forced_interpretation', message: '咒语被直接意译' })
    const retention = characterRetention(original, translation)
    if (retention < 0.45) issues.push({ code: 'mantra_text_not_preserved', message: `咒语字符保留率 ${retention.toFixed(3)}` })
  }
  return {
    passed: issues.length === 0,
    issues,
    lengthRatio: generic.lengthRatio,
    sourceCopyRatio: Number(copyRatio.toFixed(3)),
  }
}

export function parseBuddhistTranslationResponse(value: string, expectedIndexes: number[]) {
  const stripped = value.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  const payload = JSON.parse(firstJsonObject(stripped)) as { segments?: unknown }
  if (!Array.isArray(payload.segments)) throw new Error('model_missing_segments')
  const segments = payload.segments.map((segment) => {
    const item = segment as Record<string, unknown>
    return { index: Number(item.index), translation: String(item.translation ?? '').trim() }
  })
  if (segments.length !== expectedIndexes.length) throw new Error('model_segment_count_mismatch')
  for (let index = 0; index < expectedIndexes.length; index += 1) {
    if (segments[index]?.index !== expectedIndexes[index] || !segments[index]?.translation) {
      throw new Error('model_segment_alignment_mismatch')
    }
  }
  return segments satisfies GeneratedTranslationSegment[]
}

function firstJsonObject(value: string) {
  const start = value.indexOf('{')
  if (start < 0) throw new Error('model_invalid_json')
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return value.slice(start, index + 1)
    }
  }
  throw new Error('model_invalid_json')
}
