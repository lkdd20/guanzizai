import { Solar } from 'lunar-typescript'

import { sampleWork, sampleWorkPassages } from './content'

export interface DailyTheme {
  id: string
  label: string
  fortuneLabel: string
  fortuneText: string
  practice: string
  keywords: string[]
}

export interface DailyCalendarDetail {
  isoDate: string
  year: number
  month: number
  day: number
  weekday: string
  gregorianLabel: string
  lunarLabel: string
  ganzhiLabel: string
  zodiac: string
  solarTerm?: string
  dayOfficer: string
  clash: string
  sha: string
  yi: string[]
  ji: string[]
}

export interface DailyQuote {
  workId: string
  workTitle: string
  passageId: string
  quote: string
  sourceRef: string
  href: string
  sourceVerification: 'verified' | 'unverified'
}

export interface DailyCalendarResponse {
  calendar: DailyCalendarDetail
  theme: DailyTheme
  quote: DailyQuote
  recommendation: {
    reason: string
    strategy: 'published-text-retrieval'
    modelUsed: false
  }
  notice: string
}

const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export const dailyThemes: DailyTheme[] = [
  {
    id: 'stillness',
    label: '静观',
    fortuneLabel: '静定',
    fortuneText: '今日适合把步子放稳，先看清手边一事，再作取舍。少一点催促，多一点觉察。',
    practice: '留十分钟，只读一段原文。',
    keywords: ['静', '寂', '定', '清净', '摄心', '一心'],
  },
  {
    id: 'wisdom',
    label: '明辨',
    fortuneLabel: '澄明',
    fortuneText: '今日宜分清事实与猜测。遇到繁杂处，回到依据，答案会比情绪更可靠。',
    practice: '写下此刻的“已知”与“未明”。',
    keywords: ['智慧', '明', '辨别', '觉知', '如实'],
  },
  {
    id: 'compassion',
    label: '慈心',
    fortuneLabel: '和润',
    fortuneText: '今日的人际气息宜柔和。先听完一句话，再回应；一次体谅也能让事情转圜。',
    practice: '做一件确实能帮到他人的小事。',
    keywords: ['慈', '悲', '众生', '利益', '安乐', '善心'],
  },
  {
    id: 'release',
    label: '放下',
    fortuneLabel: '轻安',
    fortuneText: '今日适合清理积压与执念。能完成的就完成，不能控制的先放回原处。',
    practice: '整理一处空间，放下一项旧待办。',
    keywords: ['不执', '松开', '离', '放下', '释然'],
  },
  {
    id: 'diligence',
    label: '精进',
    fortuneLabel: '笃行',
    fortuneText: '今日适合从小处推进。与其等待完整时机，不如先完成一个清楚、可验证的步骤。',
    practice: '选一件要事，专注完成二十五分钟。',
    keywords: ['精进', '修行', '勤', '勇猛', '不退', '行'],
  },
  {
    id: 'harmony',
    label: '和合',
    fortuneLabel: '顺和',
    fortuneText: '今日宜在差异里寻找共同处。先听清彼此所指，再从容回应。',
    practice: '把一项重要约定说清楚。',
    keywords: ['和合', '平等', '无差别', '一切', '同', '无二'],
  },
  {
    id: 'generosity',
    label: '布施',
    fortuneLabel: '丰足',
    fortuneText: '今日适合分享时间、知识或善意。真正的丰足，常从愿意给予一点开始。',
    practice: '分享一份有用的资料。',
    keywords: ['布施', '施', '福德', '供养', '善根', '利益'],
  },
]

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1901 || year > 2099) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day, date }
}

export function formatChinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function buildDailyCalendar(isoDate: string): DailyCalendarDetail {
  const parsed = parseCalendarDate(isoDate)
  if (!parsed) throw new Error('invalid_calendar_date')
  const { year, month, day, date } = parsed
  const lunar = Solar.fromYmd(year, month, day).getLunar()
  const solarTerm = lunar.getJieQi().trim()
  return {
    isoDate,
    year,
    month,
    day,
    weekday: weekdays[date.getUTCDay()],
    gregorianLabel: `${year}年${month}月${day}日`,
    lunarLabel: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    ganzhiLabel: `${lunar.getYearInGanZhi()}年 · ${lunar.getMonthInGanZhi()}月 · ${lunar.getDayInGanZhi()}日`,
    zodiac: `${lunar.getYearShengXiao()}年`,
    solarTerm: solarTerm || undefined,
    dayOfficer: `${lunar.getZhiXing()}日`,
    clash: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    yi: lunar.getDayYi().filter(Boolean).slice(0, 4),
    ji: lunar.getDayJi().filter(Boolean).slice(0, 4),
  }
}

export function selectDailyTheme(isoDate: string, yi: string[] = []) {
  const joined = yi.join('')
  const preferred = joined.match(/会亲友|纳采|嫁娶/u)
    ? 'harmony'
    : joined.match(/入学|求学|开光/u)
      ? 'wisdom'
      : joined.match(/解除|扫舍|沐浴/u)
        ? 'release'
        : joined.match(/交易|纳财|立券/u)
          ? 'generosity'
          : joined.match(/出行|移徙|动土/u)
            ? 'diligence'
            : joined.match(/祈福|祭祀|求嗣/u)
              ? 'compassion'
              : null
  return dailyThemes.find((theme) => theme.id === preferred)
    ?? dailyThemes[stableHash(isoDate) % dailyThemes.length]
}

export function fallbackDailyQuote(isoDate: string, theme: DailyTheme): DailyQuote {
  const ranked = sampleWorkPassages
    .map((passage) => ({
      passage,
      score: theme.keywords.reduce((score, keyword) => (
        passage.original.includes(keyword) || passage.plain.includes(keyword) ? score + 1 : score
      ), 0),
      tieBreaker: stableHash(`${isoDate}:${theme.id}:${passage.anchorId}`),
    }))
    .sort((left, right) => right.score - left.score || left.tieBreaker - right.tieBreaker)
  const passage = ranked[0].passage
  return {
    workId: sampleWork.id,
    workTitle: sampleWork.title,
    passageId: passage.anchorId,
    quote: dailyQuoteExcerpt(passage.original, theme, isoDate),
    sourceRef: `${sampleWork.title} · 第 ${passage.seq} 段`,
    href: `/read/${sampleWork.id}#${passage.anchorId}`,
    sourceVerification: 'verified',
  }
}

export function dailyQuoteExcerpt(original: string, theme: DailyTheme, isoDate: string) {
  const normalized = original.replace(/\s+/gu, ' ').trim()
  const sentences = normalized.match(/[^。！？]+[。！？]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
  const clauses = normalized.match(/[^；。！？]+[；。！？]?/gu)?.map((clause) => clause.trim()).filter(Boolean) ?? []
  const candidates = [...sentences, ...clauses].filter((candidate) => {
    const length = Array.from(candidate).length
    return length >= 12 && length <= 72
  })
  if (!candidates.length) {
    const characters = Array.from(normalized)
    return characters.length <= 72 ? normalized : `${characters.slice(0, 70).join('')}…`
  }
  return candidates
    .map((candidate) => ({
      candidate,
      score: theme.keywords.reduce((score, keyword) => candidate.includes(keyword) ? score + 4 : score, 0),
      lengthDistance: Math.abs(Array.from(candidate).length - 38),
      tieBreaker: stableHash(`${isoDate}:${theme.id}:${candidate}`),
    }))
    .sort((left, right) => right.score - left.score || left.lengthDistance - right.lengthDistance || left.tieBreaker - right.tieBreaker)[0]
    .candidate
}

export function dailyRecommendationReason(theme: DailyTheme, fromDatabase: boolean) {
  return fromDatabase
    ? `按今日“${theme.label}”主题，从已发布原文中确定性选取；同一天全站一致。`
    : `按今日“${theme.label}”主题，从原创演示文本中选取；内容库暂不可用时自动回退。`
}
