'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, CalendarDays, CircleAlert, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { DailyCalendarResponse } from '@/lib/daily-calendar'

let pendingDailyRequest: { date: string; promise: Promise<DailyCalendarResponse> } | null = null
const dailyCalendarVersion = 'v2'

function localIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dailyCacheKey(date: string) {
  return `guanzizai:daily-calendar:${dailyCalendarVersion}:${date}`
}

function requestDailyCalendar(date: string) {
  if (pendingDailyRequest?.date === date) return pendingDailyRequest.promise
  const promise = fetch(`/api/daily?date=${date}&v=${dailyCalendarVersion}`)
    .then((response) => {
      if (!response.ok) throw new Error('daily_calendar_unavailable')
      return response.json() as Promise<DailyCalendarResponse>
    })
    .catch((error) => {
      if (pendingDailyRequest?.promise === promise) pendingDailyRequest = null
      throw error
    })
  pendingDailyRequest = { date, promise }
  return promise
}

function readCachedDailyCalendar(date: string) {
  try {
    const raw = window.sessionStorage.getItem(dailyCacheKey(date))
    return raw ? JSON.parse(raw) as DailyCalendarResponse : null
  } catch {
    return null
  }
}

function cacheDailyCalendar(date: string, value: DailyCalendarResponse) {
  try {
    window.sessionStorage.setItem(dailyCacheKey(date), JSON.stringify(value))
  } catch {
    // The in-memory request cache still avoids duplicate calls in this page session.
  }
}

export function DailyCalendarDialog() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<DailyCalendarResponse | null>(null)
  const [error, setError] = useState(false)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const date = localIsoDate()
    const cached = readCachedDailyCalendar(date)
    if (cached) {
      setData(cached)
      return undefined
    }
    let active = true
    const timer = window.setTimeout(() => {
      void requestDailyCalendar(date).then((result) => {
        cacheDailyCalendar(date, result)
        if (active) setData(result)
      }).catch(() => undefined)
    }, 320)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [requestKey])

  useEffect(() => {
    if (!open || data) return undefined
    let active = true
    const date = localIsoDate()
    setError(false)
    void requestDailyCalendar(date).then((result) => {
      cacheDailyCalendar(date, result)
      if (active) setData(result)
    }).catch(() => {
      if (active) setError(true)
    })
    return () => { active = false }
  }, [open, data, requestKey])

  function retry() {
    const date = localIsoDate()
    pendingDailyRequest = null
    window.sessionStorage.removeItem(dailyCacheKey(date))
    setData(null)
    setError(false)
    setRequestKey((value) => value + 1)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button className="daily-calendar-trigger" type="button" variant="ghost" size="icon" aria-label="打开今日历签" title="今日历签">
          <CalendarDays aria-hidden="true" />
          <span aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="daily-dialog-overlay" />
        <Dialog.Content className="daily-dialog-content" aria-describedby="daily-dialog-description">
          <header className="daily-dialog-header">
            <div>
              <span className="daily-dialog-kicker"><CalendarDays aria-hidden="true" /> 今日历签</span>
              <Dialog.Title>一日一观，自在于心</Dialog.Title>
              <Dialog.Description id="daily-dialog-description">
                传统历法参考与典藏原文推荐
              </Dialog.Description>
            </div>
            <Dialog.Close className="daily-dialog-close" aria-label="关闭今日历签">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>

          {!data && !error ? (
            <div className="daily-dialog-skeleton" role="status">
              <div className="daily-loading-label">
                <LoaderCircle aria-hidden="true" />
                <span>正在合历，择取今日原文…</span>
              </div>
              <div className="daily-skeleton-overview" aria-hidden="true">
                <i />
                <div><b /><b /><span /><span /></div>
              </div>
              <div className="daily-skeleton-pairs" aria-hidden="true"><span /><span /></div>
              <div className="daily-skeleton-quote" aria-hidden="true"><b /><span /><span /></div>
            </div>
          ) : null}

          {error ? (
            <div className="daily-dialog-error" role="alert">
              <CircleAlert aria-hidden="true" />
              <strong>今日历签暂时没有展开</strong>
              <p>网络或内容服务可能正在恢复，请稍后再试。</p>
              <Button type="button" variant="outline" onClick={retry}><RotateCcw aria-hidden="true" />重新读取</Button>
            </div>
          ) : null}

          {data ? (
            <div className="daily-dialog-body">
              <section className="daily-overview-section" aria-labelledby="daily-date-title">
                <div className="daily-date-number" aria-hidden="true">
                  <small>{String(data.calendar.month).padStart(2, '0')}月</small>
                  <strong>{String(data.calendar.day).padStart(2, '0')}</strong>
                  <span>{data.calendar.weekday}</span>
                </div>
                <div className="daily-date-copy">
                  <div className="daily-date-heading">
                    <div>
                      <h2 id="daily-date-title">{data.calendar.lunarLabel}</h2>
                      <p>{data.calendar.ganzhiLabel}</p>
                    </div>
                    {data.calendar.solarTerm ? <b>{data.calendar.solarTerm}</b> : <b>{data.calendar.dayOfficer}</b>}
                  </div>
                  <div className="daily-date-meta">
                    <span>{data.calendar.zodiac}</span>
                    <span>冲 {data.calendar.clash}</span>
                    <span>煞 {data.calendar.sha}</span>
                  </div>
                  <div className="daily-fortune-inline" aria-labelledby="daily-fortune-title">
                    <div>
                      <span>今日运势</span>
                      <h2 id="daily-fortune-title">{data.theme.fortuneLabel}</h2>
                    </div>
                    <p>{data.theme.fortuneText}</p>
                    <small><Sparkles aria-hidden="true" />今日一事 · {data.theme.practice}</small>
                  </div>
                </div>
              </section>

              <section className="daily-almanac-section" aria-label="今日黄历宜忌">
                <div className="daily-almanac-heading">
                  <strong>今日宜忌</strong>
                  <span>传统历法参考</span>
                </div>
                <div className="daily-almanac-grid">
                  <div className="daily-almanac-row is-yi">
                    <strong>宜</strong>
                    <div>{data.calendar.yi.map((item) => <span key={item}>{item}</span>)}</div>
                  </div>
                  <div className="daily-almanac-row is-ji">
                    <strong>忌</strong>
                    <div>{data.calendar.ji.map((item) => <span key={item}>{item}</span>)}</div>
                  </div>
                </div>
              </section>

              <section className="daily-quote-section" aria-labelledby="daily-quote-title">
                <div className="daily-quote-heading">
                  <div className="daily-section-heading">
                    <span>今日偈语</span>
                    <h2 id="daily-quote-title">{data.theme.label}</h2>
                  </div>
                  <Link className="daily-quote-link" href={data.quote.href} onClick={() => setOpen(false)}>
                    查看原文 <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
                <blockquote>“{data.quote.quote}”</blockquote>
                <div className="daily-quote-source">
                  <strong>{data.quote.sourceRef}</strong>
                  <span>{data.quote.sourceVerification === 'verified' ? '原文已核验' : '固定来源修订 · 原文待复核'}</span>
                </div>
              </section>

              <footer className="daily-dialog-notice">
                <CircleAlert aria-hidden="true" />
                <span>{data.notice}</span>
              </footer>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
