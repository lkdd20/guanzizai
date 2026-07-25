'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, LibraryBig, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ReaderOpeningState } from '@/components/reader-opening-state'
import { type SutraLibraryEntry } from '@/lib/content'
import { parseReadingProgress, readingProgressStorageKey, type ReadingProgressRecord } from '@/lib/reading-progress'
import { cn } from '@/lib/utils'

interface SutraLibraryProps {
  entries: SutraLibraryEntry[]
}

const catalogPageSize = 48

const librarySections = [
  {
    id: 'buddhist-canon',
    library: '佛典',
    title: '藏经阁',
    description: '佛典按版本与来源整理，已开放作品可直接进入原文与白话对照阅读。',
  },
  {
    id: 'guoxue',
    library: '国学',
    title: '国学馆',
    description: '传统文化古籍与佛典共用阅读器；每部作品分别展示来源、核验等级与发布状态。',
  },
] as const

function normalizeCatalogText(value: string) {
  return value
    .toLowerCase()
    .replaceAll('經', '经')
    .replaceAll('譯', '译')
    .replaceAll('羅', '罗')
    .replaceAll('門', '门')
    .replaceAll('華', '华')
    .replaceAll('嚴', '严')
    .replaceAll('寶', '宝')
    .replaceAll('壇', '坛')
    .replaceAll('說', '说')
    .replaceAll('維', '维')
    .replaceAll('詰', '诘')
    .replaceAll('廣', '广')
    .replaceAll('龍', '龙')
}

export function SutraLibrary({ entries }: SutraLibraryProps) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState('全部')
  const [openingTitle, setOpeningTitle] = useState('')
  const [progressByWork, setProgressByWork] = useState<Map<string, ReadingProgressRecord>>(new Map())
  const [visibleCountByLibrary, setVisibleCountByLibrary] = useState<Record<string, number>>({
    佛典: catalogPageSize,
    国学: catalogPageSize,
  })

  useEffect(() => {
    const records = parseReadingProgress(window.localStorage.getItem(readingProgressStorageKey))
    setProgressByWork(new Map(records.map((record) => [record.workId, record])))
  }, [])

  const sections = useMemo(() => ['全部', ...Array.from(new Set(entries.map((entry) => entry.section)))], [entries])

  const filteredEntries = useMemo(() => {
    const normalized = normalizeCatalogText(query.trim())
    return entries.filter((entry) => {
      const matchQuery =
        !normalized ||
        normalizeCatalogText([entry.title, entry.section, entry.dynasty, entry.translator, entry.status, entry.note].join(' '))
          .includes(normalized)
      const matchSection = section === '全部' || entry.section === section
      return matchQuery && matchSection
    })
  }, [entries, query, section])

  useEffect(() => {
    setVisibleCountByLibrary({ 佛典: catalogPageSize, 国学: catalogPageSize })
  }, [query, section])

  const groupedEntries = useMemo(() => librarySections.map((item) => ({
    ...item,
    entries: filteredEntries
      .filter((entry) => entry.library === item.library)
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1
        return left.title.localeCompare(right.title, 'zh-CN')
      }),
  })), [filteredEntries])

  return (
    <>
      <div className="library-filter">
        <div className="library-search">
          <Search size={16} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="检索书名、部类、作者"
            aria-label="检索藏经阁"
          />
        </div>

        <div className="library-filter-group" aria-label="部类筛选">
          {sections.map((item) => (
            <Button
              type="button"
              size="sm"
              variant={section === item ? 'default' : 'secondary'}
              key={item}
              onClick={() => setSection(item)}
            >
              {item}
            </Button>
          ))}
        </div>

      </div>

      <div className="mt-4 text-sm text-muted-foreground">共找到 {filteredEntries.length.toLocaleString('zh-CN')} 部典籍。</div>

      {groupedEntries.map((group) => {
        const visibleCount = visibleCountByLibrary[group.library] ?? catalogPageSize
        const visibleEntries = group.entries.slice(0, visibleCount)
        const remainingCount = Math.max(0, group.entries.length - visibleEntries.length)

        return (
          <section className="library-section" id={group.id} key={group.library} aria-labelledby={`${group.id}-title`}>
            <div className="library-section-head">
              <div>
                <span className="kicker">{group.library}</span>
                <h2 id={`${group.id}-title`}>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <Badge variant="outline">{group.entries.length} 部</Badge>
            </div>

            {group.entries.length ? (
              <>
                <div className="library-grid mt-5">
                  {visibleEntries.map((entry) => {
                    const Icon = BookOpen
                    const workId = entry.workId ?? entry.href?.match(/^\/read\/([^/?#]+)/)?.[1]
                    const storedProgress = workId ? progressByWork.get(decodeURIComponent(workId)) : undefined
                    const progress = storedProgress
                      && (!entry.contentVersion || storedProgress.contentVersion === entry.contentVersion)
                      && storedProgress.sequence > 1
                      ? storedProgress
                      : undefined
                    const readingHref = entry.href && progress
                      ? `${entry.href}${entry.href.includes('?') ? '&' : '?'}start=${progress.sequence}`
                      : entry.href
                    return (
                      <Card key={entry.workId ?? `${entry.library}-${entry.title}`} className={cn('library-card', !entry.available && 'unavailable')}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4">
                            <div className="library-card-statuses">
                              <Badge variant={entry.available ? 'default' : 'muted'}>{entry.status}</Badge>
                            </div>
                            <Icon className="text-primary" size={18} />
                          </div>
                          <CardTitle className="leading-relaxed">{entry.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="library-meta">
                            <Badge variant="outline">{entry.section}</Badge>
                            <Badge variant="outline">{entry.volume}</Badge>
                            <Badge variant="outline">{entry.dynasty}</Badge>
                          </div>
                          <p className="mt-4 text-sm leading-7 text-muted-foreground">{entry.translator}</p>
                          <p className="mt-3 text-sm leading-7 text-muted-foreground">{entry.note}</p>
                        </CardContent>
                        <CardFooter>
                          {readingHref ? (
                            <Button asChild className="w-full">
                              <Link href={readingHref} prefetch onClick={() => setOpeningTitle(entry.title)}>
                                {progress ? `继续阅读 · 第 ${progress.sequence} 段` : '开始阅读'} <ArrowRight />
                              </Link>
                            </Button>
                          ) : (
                            <Button className="w-full" disabled variant="secondary">
                              待版本确认
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    )
                  })}
                </div>
                <div className="mt-6 flex flex-col items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
                  <span>
                    已显示 {visibleEntries.length.toLocaleString('zh-CN')} / {group.entries.length.toLocaleString('zh-CN')} 部
                  </span>
                  {remainingCount > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setVisibleCountByLibrary((current) => ({
                        ...current,
                        [group.library]: visibleCount + catalogPageSize,
                      }))}
                    >
                      继续显示 {Math.min(catalogPageSize, remainingCount)} 部
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="library-empty">
                <LibraryBig aria-hidden="true" />
                <p>暂无匹配条目。已核验文本到位后，会沿用同一套导入脚本和阅读页开放。</p>
              </div>
            )}
          </section>
        )
      })}
      {openingTitle && typeof document !== 'undefined'
        ? createPortal(<ReaderOpeningState title={openingTitle} overlay />, document.body)
        : null}
    </>
  )
}
