import { describe, expect, it } from 'vitest'

import {
  inspectGeneratedBuddhistTranslation,
  isBuddhistMantraText,
  isBuddhistNameEnumeration,
  isBuddhistStructuralHeading,
  parseBuddhistTranslationResponse,
} from '../apps/web/lib/buddhist-translation-quality'

describe('generated Buddhist translation gate', () => {
  it('accepts a modern close translation without commentary', () => {
    const report = inspectGeneratedBuddhistTranslation(
      '舊記載：此頁不增不減，不藏不露，晨讀則明。',
      '旧记录写道：这一页既没有增加也没有减少，既不隐藏也不显露，早晨阅读便能明白。',
    )
    expect(report.passed).toBe(true)
  })

  it('blocks model residue, mechanical rewrites and unsupported concepts', () => {
    const report = inspectGeneratedBuddhistTranslation(
      '匠人檢得三只空匣，遂免兩場風雨。',
      '这段用现代汉语直述为：在是至五蕴都是缘起而无固定自性的，所以远离苦难。',
    )
    const codes = report.issues.map((issue) => issue.code)
    expect(codes).toContain('model_meta_text')
    expect(codes).toContain('mechanical_rewrite_artifact')
    expect(codes).toContain('added_interpretive_concept')
  })

  it('keeps mantra text instead of publishing a forced interpretation', () => {
    const report = inspectGeneratedBuddhistTranslation(
      '即錄咒曰：羅尼迦，摩沙迦，迦羅娑。',
      '咒语的意思是：去吧，到远处完成目标。',
    )
    expect(report.issues.map((issue) => issue.code)).toContain('mantra_forced_interpretation')
  })

  it('allows unchanged structural headings without allowing unchanged body text', () => {
    const heading = '校勘緣起分第一『整理說明，由此開始』'
    expect(isBuddhistStructuralHeading(heading)).toBe(true)
    expect(inspectGeneratedBuddhistTranslation(heading, heading, { allowUnchangedSource: true }).passed).toBe(true)
    expect(inspectGeneratedBuddhistTranslation('晨光入窗，讀者展卷。', '晨光入窗，讀者展卷。').passed).toBe(false)
    expect(isBuddhistStructuralHeading('晨光入窗，讀者展卷。')).toBe(false)
  })

  it('preserves transliterated mantras without treating them as an untranslated body passage', () => {
    const mantra = ';演示真言\n唵。羅米羅米。迦沙羅米。羅羅米。摩迦娑'
    expect(isBuddhistMantraText(mantra)).toBe(true)
    expect(inspectGeneratedBuddhistTranslation(mantra, mantra, {
      allowUnchangedSource: true,
      allowSourceCopy: true,
    }).passed).toBe(true)
  })

  it('allows retained proper-name lists but still blocks a wholly unchanged list', () => {
    const names = '所謂青禾、墨川、松野、雲橋、竹溪、石泉、月庭、星渡、紙舟、木窗、雨巷。'
    expect(isBuddhistNameEnumeration(names)).toBe(true)
    expect(inspectGeneratedBuddhistTranslation(names, names, { allowSourceCopy: true }).passed).toBe(false)
  })

  it('parses only complete ordered segment JSON', () => {
    expect(parseBuddhistTranslationResponse(
      '```json\n{"segments":[{"index":1,"translation":"第一段。"},{"index":2,"translation":"第二段。"}]}\n```',
      [1, 2],
    )).toEqual([
      { index: 1, translation: '第一段。' },
      { index: 2, translation: '第二段。' },
    ])
    expect(() => parseBuddhistTranslationResponse(
      '{"segments":[{"index":2,"translation":"错序。"}]}',
      [1],
    )).toThrow('model_segment_alignment_mismatch')
  })

  it('uses the first complete JSON object when a model repeats its answer', () => {
    expect(parseBuddhistTranslationResponse(
      '{"segments":[{"index":1,"translation":"第一版。"}]}\n{"segments":[{"index":1,"translation":"重复版。"}]}',
      [1],
    )).toEqual([{ index: 1, translation: '第一版。' }])
  })
})
