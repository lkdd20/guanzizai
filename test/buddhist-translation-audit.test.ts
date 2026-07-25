import { describe, expect, it } from 'vitest'

import {
  auditBuddhistTranslation,
  summarizeBuddhistTranslationAudits,
} from '../scripts/lib/buddhist-translation-audit.mjs'
import { heartSutraPassages } from '../apps/web/lib/content'

describe('Buddhist translation risk audit', () => {
  it('flags doctrinal additions that are not stated in the source', () => {
    const report = auditBuddhistTranslation({
      original: '匠人檢得三只空匣，遂免兩場風雨。',
      translation: '匠人发现三个空匣都是缘起而无固定自性的，因此避开两场风雨。',
    })

    expect(report.riskLevel).toBe('high')
    expect(report.issues.filter((issue: { code: string }) => issue.code === 'added_interpretive_concept')).toHaveLength(2)
  })

  it('requires mantra text to remain present instead of forcing an interpretation', () => {
    const forced = auditBuddhistTranslation({
      original: '即錄咒曰：羅尼迦，摩沙迦，迦羅娑。',
      translation: '咒语的意思是：去吧，到远处完成目标。',
    })
    const preserved = auditBuddhistTranslation({
      original: '即錄咒曰：羅尼迦，摩沙迦，迦羅娑。',
      translation: '接着记录咒语：罗尼迦，摩沙迦，迦罗娑。',
    })

    expect(forced.issues.map((issue: { code: string }) => issue.code)).toContain('mantra_forced_interpretation')
    expect(preserved.issues.map((issue: { code: string }) => issue.code)).not.toContain('mantra_forced_interpretation')
    expect(preserved.issues.map((issue: { code: string }) => issue.code)).not.toContain('mantra_text_not_preserved')
  })

  it('flags missing negation, numbers, dialogue and work-specific terms', () => {
    const report = auditBuddhistTranslation({
      original: '館主告青禾曰：五卷不可借。',
      translation: '馆主谈到了这些卷册。',
      terms: [{ termTraditional: '青禾', termSimplified: '青禾' }],
    })
    const codes = report.issues.map((issue: { code: string }) => issue.code)

    expect(codes).toContain('negation_missing')
    expect(codes).toContain('number_not_preserved')
    expect(codes).toContain('dialogue_relation_review')
    expect(codes).toContain('term_rendering_review')
  })

  it('compares numeric expressions after traditional-to-simplified normalization', () => {
    const report = auditBuddhistTranslation({
      original: '庫中藏六萬紙，歷八萬四千日。',
      translation: '库中收藏六万张纸，经过八万四千日。',
    })
    const falsePositive = auditBuddhistTranslation({
      original: '舊冊常無墨痕，記三層書架。',
      translation: '旧册一直没有墨痕，记录三层书架。',
    })

    expect(report.issues.map((issue: { code: string }) => issue.code)).not.toContain('number_not_preserved')
    expect(falsePositive.issues.map((issue: { code: string }) => issue.code)).not.toContain('number_not_preserved')
  })

  it('treats an explicit leading one as the same Chinese number', () => {
    const report = auditBuddhistTranslation({
      original: '與抄書人千二百五十人俱。',
      translation: '与一千二百五十位抄书人在一起。',
    })

    expect(report.issues.map((issue: { code: string }) => issue.code)).not.toContain('number_not_preserved')
  })

  it('flags mechanical rewrite residue and long simplified source copies', () => {
    const residue = auditBuddhistTranslation({
      original: '乃至所有讀者，皆得安坐。',
      translation: '这段用现代汉语直述为：在是至所有读者，都得安坐。',
    })
    const longSource = '晨光入窗，館主在青石書房整理舊冊，與抄書人核對千二百五十頁的編號。'.repeat(4)
    const sourceCopy = auditBuddhistTranslation({
      original: longSource,
      translation: toSimplifiedForTest(longSource),
    })

    expect(residue.issues.map((issue: { code: string }) => issue.code)).toContain('mechanical_rewrite_artifact')
    expect(sourceCopy.issues.map((issue: { code: string }) => issue.code)).toContain('source_copy_rewrite')
  })

  it('ranks passages and summarizes each work without changing review state', () => {
    const summary = summarizeBuddhistTranslationAudits([
      { workId: 'a', workTitle: '甲册', passageId: 'a-1', sequence: 1, original: '晨光入窗。', translation: '早晨的光照进窗户。' },
      { workId: 'a', workTitle: '甲册', passageId: 'a-2', sequence: 2, original: '無紙無墨。', translation: '这里谈到纸和墨。' },
    ])

    expect(summary.totals.passages).toBe(2)
    expect(summary.works[0]).toMatchObject({ workId: 'a', passages: 2 })
    expect(summary.passages[0].passageId).toBe('a-2')
    expect(summary.passages[0].riskLevel).toBe('high')
  })

  it('keeps the fictional sample translations out of the high-risk queue', () => {
    const reports = heartSutraPassages.map((passage) => auditBuddhistTranslation({
      original: passage.original,
      translation: passage.plain,
    }))

    expect(reports.filter((report) => report.riskLevel === 'high')).toHaveLength(0)
  })
})

function toSimplifiedForTest(value: string) {
  return value
    .replaceAll('館', '馆')
    .replaceAll('書', '书')
    .replaceAll('舊', '旧')
    .replaceAll('與', '与')
    .replaceAll('對', '对')
    .replaceAll('頁', '页')
    .replaceAll('編', '编')
    .replaceAll('號', '号')
}
