import { describe, expect, it } from 'vitest'

import {
  buildDailyCalendar,
  dailyQuoteExcerpt,
  dailyThemes,
  fallbackDailyQuote,
  parseCalendarDate,
  selectDailyTheme,
} from '../apps/web/lib/daily-calendar'

describe('每日历签', () => {
  it('计算公历、农历与干支，不依赖外部接口', () => {
    const calendar = buildDailyCalendar('2024-02-10')

    expect(calendar.gregorianLabel).toBe('2024年2月10日')
    expect(calendar.lunarLabel).toBe('农历正月初一')
    expect(calendar.ganzhiLabel).toContain('甲辰年')
    expect(calendar.zodiac).toBe('龙年')
    expect(calendar.yi.length).toBeGreaterThan(0)
    expect(calendar.ji.length).toBeGreaterThan(0)
  })

  it('拒绝不存在或超出支持范围的日期', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull()
    expect(parseCalendarDate('1899-01-01')).toBeNull()
    expect(parseCalendarDate('not-a-date')).toBeNull()
  })

  it('同一天和同一宜项会得到稳定主题', () => {
    const first = selectDailyTheme('2026-07-16', ['会亲友'])
    const second = selectDailyTheme('2026-07-16', ['会亲友'])

    expect(first.id).toBe('harmony')
    expect(second).toEqual(first)
    expect(dailyThemes.some((theme) => theme.id === first.id)).toBe(true)
  })

  it('内容库不可用时只回退到原创演示文本', () => {
    const theme = selectDailyTheme('2026-07-16')
    const quote = fallbackDailyQuote('2026-07-16', theme)

    expect(quote.workId).toBe('sample-work')
    expect(quote.sourceVerification).toBe('verified')
    expect(quote.quote.length).toBeGreaterThan(0)
    expect(quote.href).toMatch(/^\/read\/sample-work#sample-work_j1_\d{4}$/)
  })

  it('从长段原文中选择完整、简短且贴合主题的句子', () => {
    const theme = dailyThemes.find((item) => item.id === 'harmony')!
    const excerpt = dailyQuoteExcerpt(
      '阅读之前先核对来源，理解之时再比对上下文。若只摘一句，容易忽略前后条件；若保留版本与段落位置，后来的人便能重新核验。记录不是束缚，而是让讨论有共同的起点。',
      theme,
      '2026-07-16',
    )

    expect(excerpt.length).toBeGreaterThan(0)
    expect(excerpt.endsWith('。')).toBe(true)
    expect(Array.from(excerpt).length).toBeLessThanOrEqual(72)
  })
})
