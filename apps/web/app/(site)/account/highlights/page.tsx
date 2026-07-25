import Link from 'next/link'
import { Highlighter, LibraryBig, Quote } from 'lucide-react'
import { redirect } from 'next/navigation'

import { AccountRecord } from '@/components/account-record-delete'
import { Button } from '@/components/ui/button'
import { listAccountHighlights } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const metadata = { title: '我的划线', robots: { index: false, follow: false } }

export default async function HighlightsPage() {
  const session = await getAuthSession()
  if (!session) redirect('/login?next=/account/highlights')
  const highlights = await listAccountHighlights(session.user).catch(() => [])
  const groups = new Map<string, typeof highlights>()
  highlights.forEach((item) => {
    const key = `${item.workId}:${item.workTitle}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  })
  return (
    <div className="site-container account-library-page">
      <header className="account-page-head"><span className="account-page-icon"><Highlighter /></span><div><span className="kicker">原文留痕</span><h1>我的划线</h1><p>{highlights.length ? `共保存 ${highlights.length} 条原文划线。` : '在原文中选中文字，划线会集中保存在这里。'}</p></div></header>
      {highlights.length ? <div className="account-highlight-groups">{Array.from(groups.entries()).map(([key, items]) => <section key={key} className="account-highlight-group"><header><Quote /><h2>{items[0].workTitle}</h2><span>{items.length} 条</span></header><div className="account-record-list">{items.map((item) => <AccountRecord className="account-record account-highlight-record" color={item.color} id={item.id} kind="highlight" key={item.id}><div className="account-record-main"><div className="account-record-meta"><span>第 {item.sequence} 段</span><time>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time></div><blockquote>{item.selectedText}</blockquote><Link className="account-record-link" href={`/read/${item.workId}?start=${item.sequence}#${item.passageAnchor}`}>查看原文</Link></div></AccountRecord>)}</div></section>)}</div> : <section className="account-empty"><LibraryBig /><h2>还没有划线</h2><p>阅读时选中一段原文，再点“划线”。</p><Button asChild><Link href="/read/sample-work">开始阅读</Link></Button></section>}
    </div>
  )
}
