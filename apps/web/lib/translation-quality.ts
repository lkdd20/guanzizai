import { createHash } from 'node:crypto'

export interface TranslationQualityReport {
  passed: boolean
  issues: string[]
  lengthRatio: number
}

export function translationContentHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function inspectTranslation(original: string, translation: string): TranslationQualityReport {
  const issues: string[] = []
  const ratio = [...translation].length / Math.max(1, [...original].length)
  if (!translation.trim()) issues.push('empty')
  if (ratio < 0.45) issues.push('possibly_truncated')
  if (ratio > 3.5) issues.push('possibly_expanded')
  if (/作为(?:一个)?AI|无法翻译|以下是翻译|希望能帮到/u.test(translation)) issues.push('model_meta_text')
  if (translation.trim() === original.trim()) issues.push('unchanged_source')
  return { passed: issues.length === 0, issues, lengthRatio: Number(ratio.toFixed(3)) }
}
