import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SutraLibrary } from '@/components/sutra-library'
import { type SutraLibraryEntry } from '@/lib/content'
import { getPublicCatalog } from '@/lib/content-repository'

export const metadata = {
  title: '典藏',
  description: '观自在典藏：古籍原文、白话辅助和出处核验共用同一套阅读流程。',
}

// The public catalog changes infrequently. Rendering it on every navigation made
// the browser wait for a fresh Vercel -> PostgreSQL round trip (especially slow
// after a Neon cold start). ISR keeps navigation and Link prefetch fast while
// still refreshing publication changes within a short, bounded window.
export const revalidate = 300

export default async function SutrasPage() {
  const { staticEntries, databaseWorks } = await getPublicCatalog()
  const databaseEntries: SutraLibraryEntry[] = databaseWorks.map((work) => ({
    workId: work.id,
    contentVersion: work.contentRevision,
    library: '国学',
    sourceVerification: work.sourceVerification === 'verified' ? 'verified' : 'unverified',
    sourceBatch: work.sourceBatch,
    section: work.category ?? '古籍',
    title: work.title,
    volume: `${work.passageCount.toLocaleString('zh-CN')} 段`,
    dynasty: work.dynasty ?? '年代待考',
    translator: work.author ?? '作者待考',
    status: '已上线',
    note: work.publishedTranslationCount > 0
      ? '原文与 AI 白话分节对照已开放。'
      : '原文已开放阅读。',
    available: true,
    href: `/read/${work.id}`,
  }))
  const databaseTitles = new Set(databaseEntries.map((entry) => entry.title))
  const entries = [...staticEntries.filter((entry) => !databaseTitles.has(entry.title)), ...databaseEntries]
  const available = entries.filter((entry) => entry.available).length
  const guoxueCount = entries.filter((entry) => entry.library === '国学').length

  return (
    <div className="site-container">
      <section className="library-hero">
        <span className="kicker">典藏</span>
        <h1 className="section-title">古籍原文与辅助释文，共用一套对照阅读。</h1>
        <p className="section-copy">
          这里展示已经开放阅读的非宗教古籍。尚在拆卷、去重和核验的来源文件只在后台管理，不计作公开书籍。
        </p>
        <div className="library-toolbar">
          <div className="flex flex-wrap gap-2">
            <Badge>已上线 {available}</Badge>
            <Badge variant="outline">古籍 {guoxueCount}</Badge>
          </div>
          <Button asChild>
            <Link href="/read/sample-work">
              打开原创样例 <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="section pt-8">
        <SutraLibrary entries={entries} />
      </section>
    </div>
  )
}
