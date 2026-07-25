import type { Metadata } from 'next'
import { BookCheck, BookOpen, CalendarDays, Clock3, Feather, ScrollText } from 'lucide-react'
import { notFound } from 'next/navigation'

import { getPublicProfile } from '@/lib/account-library-db'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const profile = await getPublicProfile(slug).catch(() => null)
  return { title: profile ? `${profile.displayName}的阅读主页` : '个人主页', robots: { index: false, follow: false } }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile = await getPublicProfile(slug).catch(() => null)
  if (!profile) notFound()
  return (
    <div className="public-profile-page">
      <div className="site-container public-profile-inner">
        <header className="public-profile-head">
          <span className="public-profile-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : profile.displayName.slice(0, 1)}</span>
          <div><span className="kicker">观自在 · 阅读者</span><h1>{profile.displayName}</h1>{profile.bio ? <p>{profile.bio}</p> : <p className="public-profile-quiet">在原文中慢慢读，在共建中留下可核验的痕迹。</p>}<small><CalendarDays />{new Date(profile.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })} 加入</small></div>
        </header>
        {profile.milestones ? <section className="public-mileage" aria-label="阅读里程"><div><BookOpen /><span>读过典籍</span><strong>{profile.milestones.works}</strong></div><div><BookCheck /><span>完整读完</span><strong>{profile.milestones.completed}</strong></div><div><CalendarDays /><span>活跃天数</span><strong>{profile.milestones.activeDays}</strong></div><div><Clock3 /><span>阅读分钟</span><strong>{profile.milestones.totalMinutes}</strong></div></section> : null}
        {profile.contributions.length ? <section className="public-contributions"><header><span><Feather /></span><div><h2>共建作品</h2><p>以下记录已经审核采用，并由用户选择公开。</p></div></header><div>{profile.contributions.map((item, index) => <article key={`${item.title}-${index}`}><ScrollText /><div><strong>{item.title}</strong><small>{item.kind === 'correction' ? '勘误' : item.kind === 'translation_resource' ? '译文资料' : '典藏共建'} · {new Date(item.date).toLocaleDateString('zh-CN')}</small></div></article>)}</div></section> : null}
        {!profile.milestones && !profile.contributions.length ? <section className="public-profile-empty"><Feather /><p>这位阅读者暂未公开更多内容。</p></section> : null}
      </div>
    </div>
  )
}
