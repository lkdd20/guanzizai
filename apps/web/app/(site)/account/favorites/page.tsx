import Link from 'next/link'
import { Bookmark, BookOpen, LibraryBig } from 'lucide-react'
import { redirect } from 'next/navigation'

import { AccountRecord } from '@/components/account-record-delete'
import { Button } from '@/components/ui/button'
import { listAccountBookmarks } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const metadata = { title: '我的收藏', robots: { index: false, follow: false } }

export default async function FavoritesPage() {
  const session = await getAuthSession()
  if (!session) redirect('/login?next=/account/favorites')
  const bookmarks = await listAccountBookmarks(session.user).catch(() => [])
  return (
    <div className="site-container account-library-page">
      <header className="account-page-head"><span className="account-page-icon"><Bookmark /></span><div><span className="kicker">随读随存</span><h1>我的收藏</h1><p>{bookmarks.length ? `已收藏 ${bookmarks.length} 个阅读位置。` : '收藏喜欢的页面，之后可以从原处继续。'}</p></div></header>
      {bookmarks.length ? <div className="account-record-list">{bookmarks.map((item) => <AccountRecord className="account-record" id={item.id} kind="bookmark" key={item.id}>
        <span className="account-record-mark"><Bookmark /></span><div className="account-record-main"><div className="account-record-meta"><strong>{item.workTitle}</strong><span>第 {item.sequence} 段</span><time>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time></div><blockquote>{item.excerpt}</blockquote><Link className="account-record-link" href={`/read/${item.workId}?start=${item.sequence}#${item.passageAnchor}`}><BookOpen />回到原文</Link></div>
      </AccountRecord>)}</div> : <section className="account-empty"><LibraryBig /><h2>还没有收藏</h2><p>在阅读页点击书签图标，即可保存当前段落。</p><Button asChild><Link href="/sutras">去典藏阅读</Link></Button></section>}
    </div>
  )
}
