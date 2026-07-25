import { describe, expect, it } from 'vitest'

import { inspectTranslation, translationContentHash } from '../apps/web/lib/translation-quality'

describe('translation quality checks', () => {
  it('accepts a plausible faithful draft', () => {
    const report = inspectTranslation('有屠人货肉归，日已暮。', '有个屠户卖完肉回家，天色已经晚了。')
    expect(report.passed).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('rejects model commentary and unchanged source text', () => {
    expect(inspectTranslation('有屠人货肉归。', '作为AI，以下是翻译。').issues).toContain('model_meta_text')
    expect(inspectTranslation('有屠人货肉归。', '有屠人货肉归。').issues).toContain('unchanged_source')
  })

  it('produces stable content hashes', () => {
    expect(translationContentHash('白话译文')).toBe(translationContentHash('白话译文'))
    expect(translationContentHash('白话译文')).not.toBe(translationContentHash('另一译文'))
  })
})
