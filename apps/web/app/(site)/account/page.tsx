import Link from 'next/link'
import { Bookmark, CalendarClock, Clock3, Globe2, HeartHandshake, Highlighter, LogOut, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ReadingDataControls } from '@/components/reading-data-controls'
import { listAccountReadingProgress } from '@/lib/account-db'
import { getAuthSession, providerLabel } from '@/lib/auth'

export const metadata = {
  title: '用户中心',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AccountPage() {
  const session = await getAuthSession()

  if (!session) {
    return (
      <div className="site-container">
        <section className="auth-panel quiet-panel">
          <span className="kicker">用户中心</span>
          <h1 className="mt-3 text-3xl font-bold">请先登录。</h1>
          <p className="mt-3 leading-8 text-muted-foreground">
            登录后可以同步阅读位置、查看共建记录，并在不同设备继续阅读。
          </p>
          <Button asChild className="mt-6">
            <Link href="/login?next=/account">前往登录</Link>
          </Button>
        </section>
      </div>
    )
  }

  const readingProgress = await listAccountReadingProgress(session.user, 6).catch(() => [])

  return (
    <div className="site-container">
      <section className="auth-panel quiet-panel account-panel">
        <span className="kicker">用户中心</span>
        <div className="account-profile">
          {session.user.avatarUrl ? (
            <img src={session.user.avatarUrl} alt="" width="72" height="72" referrerPolicy="no-referrer" />
          ) : (
            <span aria-hidden="true">{session.user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <h1>{session.user.name}</h1>
            <p>{session.user.email}</p>
          </div>
        </div>
        <p className="mt-3 leading-8 text-muted-foreground">
          这里保存你的阅读与共建档案。阅读位置、收藏与划线会在登录设备间同步；公开主页始终由你决定展示范围。
        </p>
        <div className="account-info-grid">
          <div>
            <ShieldCheck aria-hidden="true" />
            <span>登录方式</span>
            <strong>{providerLabel(session.user.provider)}</strong>
          </div>
          <div>
            <CalendarClock aria-hidden="true" />
            <span>会话有效期</span>
            <strong>{new Date(session.expiresAt * 1000).toLocaleDateString('zh-CN')}</strong>
          </div>
        </div>
        <div className="account-future-grid">
          <article><Bookmark /><div><strong>我的收藏</strong><span>保存喜欢的页面，从原段落继续阅读。</span></div><Link href="/account/favorites">查看收藏</Link></article>
          <article id="reading-records"><Clock3 /><div><strong>阅读历史</strong><span>{readingProgress.length ? `已有 ${readingProgress.length} 部最近阅读记录。` : '开始阅读后会在这里形成跨设备进度。'}</span></div><Link href="/account/history">查看历史</Link></article>
          <article><Highlighter /><div><strong>我的划线</strong><span>集中整理阅读时标记的原文片段。</span></div><Link href="/account/highlights">查看划线</Link></article>
          <article><Globe2 /><div><strong>公开个人主页</strong><span>分别选择是否公开简介、共建作品和阅读里程；邮箱永不公开。</span></div><Link href="/account/profile">隐私设置</Link></article>
          <article><HeartHandshake /><div><strong>共建记录</strong><span>提交译文、原文来源、勘误与授权资料。</span></div><Link href="/contribute">参与共建</Link></article>
        </div>
        <ReadingDataControls />
        <form action="/api/auth/logout" method="post" className="account-actions">
          <input type="hidden" name="next" value="/" />
          <Button type="submit" variant="secondary">
            <LogOut /> 退出登录
          </Button>
          <Button asChild variant="ghost">
            <Link href="/read/sample-work">继续阅读</Link>
          </Button>
        </form>
      </section>
    </div>
  )
}
