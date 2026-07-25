import { describe, expect, it } from 'vitest'

import { analyzeWork } from '../scripts/check-publication-quality.mjs'

function work(originals: string[]) {
  return {
    sutra: { id: 'test-work', title_zh: '测试作品' },
    passages: originals.map((original) => ({ original })),
  }
}

describe('publication quality gate', () => {
  it('rejects unpunctuated text with suspicious glyphs and long passages', () => {
    const report = analyzeWork(work(Array.from({ length: 8 }, () => `古文${'文'.repeat(1100)}\uE123`)))
    expect(report.publishable).toBe(false)
    expect(report.reasons).toContain('punctuation-density-too-low')
    expect(report.reasons).toContain('too-many-long-passages')
  })

  it('accepts normally punctuated, readable passages', () => {
    const report = analyzeWork(work(['有一书生，夜行山中。忽闻人语，回首不见。', '次日归家，方知是梦。']))
    expect(report.publishable).toBe(true)
    expect(report.reasons).toEqual([])
  })
})
