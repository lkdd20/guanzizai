import 'server-only'

import {
  buildDailyCalendar,
  dailyQuoteExcerpt,
  dailyRecommendationReason,
  fallbackDailyQuote,
  selectDailyTheme,
  type DailyCalendarResponse,
  type DailyQuote,
  type DailyTheme,
} from '@/lib/daily-calendar'
import { getDailyPublishedQuote } from '@/lib/content-db'

async function findPublishedQuote(isoDate: string, theme: DailyTheme): Promise<DailyQuote | null> {
  const result = await getDailyPublishedQuote(isoDate, theme.keywords).catch(() => null)
  if (!result) return null
  return {
    workId: result.workId,
    workTitle: result.workTitle,
    passageId: result.passageId,
    quote: dailyQuoteExcerpt(result.quote, theme, isoDate),
    sourceRef: `《${result.workTitle}》 · 卷 ${result.juan} · 第 ${result.sequence} 段`,
    href: `/read/${encodeURIComponent(result.workId)}?start=${result.sequence}#${encodeURIComponent(result.passageId)}`,
    sourceVerification: result.sourceVerification === 'verified' ? 'verified' : 'unverified',
  }
}

export async function getDailyCalendarResponse(isoDate: string): Promise<DailyCalendarResponse> {
  const calendar = buildDailyCalendar(isoDate)
  const theme = selectDailyTheme(isoDate, calendar.yi)
  const publishedQuote = await findPublishedQuote(isoDate, theme)
  const quote = publishedQuote ?? fallbackDailyQuote(isoDate, theme)
  return {
    calendar,
    theme,
    quote,
    recommendation: {
      reason: dailyRecommendationReason(theme, Boolean(publishedQuote)),
      strategy: 'published-text-retrieval',
      modelUsed: false,
    },
    notice: '传统历法内容仅作文化参考，不构成决定或承诺；偈语为典藏原文，释义请回到阅读页核验。',
  }
}
