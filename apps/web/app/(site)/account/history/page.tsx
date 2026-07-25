import Link from 'next/link'
import { Activity, BookCheck, BookOpen, CalendarDays, Clock3, LibraryBig } from 'lucide-react'
import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { getReadingHistory } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const metadata = { title: '阅读历史', robots: { index: false, follow: false } }

export default async function HistoryPage() {
  const session = await getAuthSession()
  if (!session) redirect('/login?next=/account/history')
  const history = await getReadingHistory(session.user).catch(() => ({ items: [], stats: { averageProgress: 0, completed: 0, activeDays: 0, totalMinutes: 0 } }))
  const stats = [
    { icon: Activity, label: '平均进度', value: `${Math.round(history.stats.averageProgress * 100)}%` },
    { icon: BookCheck, label: '已读完', value: `${history.stats.completed} 部` },
    { icon: CalendarDays, label: '近七天活跃', value: `${history.stats.activeDays} 天` },
    { icon: Clock3, label: '累计阅读', value: history.stats.totalMinutes >= 60 ? `${(history.stats.totalMinutes / 60).toFixed(1)} 小时` : `${history.stats.totalMinutes} 分钟` },
  ]
  return (
    <div className="site-container account-library-page">
      <header className="account-page-head"><span className="account-page-icon"><Clock3 /></span><div><span className="kicker">阅读足迹</span><h1>阅读历史</h1><p>从进度、完成度与活跃时间回看自己的阅读节奏。</p></div></header>
      <section className="reading-stat-grid">{stats.map(({ icon: Icon, label, value }) => <div key={label}><Icon /><span>{label}</span><strong>{value}</strong></div>)}</section>
      {history.items.length ? <section className="recent-reading"><header><h2>最近阅读</h2><span>{history.items.length} 部典籍</span></header><div className="reading-history-list">{history.items.map((item) => <article key={item.workId}><div className="reading-history-title"><span><BookOpen /></span><div><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleDateString('zh-CN')} · 第 {item.sequence} 段</small></div></div><div className="reading-history-progress"><div><span style={{ width: `${Math.max(2, Math.round(item.progressRatio * 100))}%` }} /></div><strong>{Math.round(item.progressRatio * 100)}%</strong></div><Button asChild variant="outline" size="sm"><Link href={`/read/${item.workId}?start=${item.sequence}`}>{item.completedAt ? '再次阅读' : '继续阅读'}</Link></Button></article>)}</div></section> : <section className="account-empty"><LibraryBig /><h2>还没有阅读记录</h2><p>打开一本典籍后，进度会自动保存在这里。</p><Button asChild><Link href="/sutras">浏览典藏</Link></Button></section>}
    </div>
  )
}
