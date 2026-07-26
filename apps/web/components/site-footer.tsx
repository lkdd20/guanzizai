import Link from 'next/link'
import { ArrowRight, FileClock } from 'lucide-react'

import { updateRecords } from '@/lib/content'

const groups = [
  {
    title: '阅读',
    links: [
      { href: '/read/sample-work', label: '原创阅读样例' },
      { href: '/sutras', label: '古籍典藏' },
      { href: '/ask', label: '观自在问' },
    ],
  },
  {
    title: '可信',
    links: [
      { href: '/about', label: '可信说明' },
      { href: '/about#collection', label: '收录规则' },
      { href: '/updates', label: '更新记录' },
    ],
  },
  {
    title: '服务',
    links: [
      { href: '/account', label: '用户中心' },
      { href: '/contribute', label: '共建典藏' },
      { href: '/privacy', label: '隐私政策' },
      { href: '/terms', label: '服务条款' },
    ],
  },
]

export function SiteFooter() {
  const latest = updateRecords[0]

  return (
    <footer className="site-footer">
      <div className="site-container">
        <div className="site-footer-panel">
          <div className="site-footer-statement">
            <Link className="site-footer-brand" href="/" prefetch={false}>
              <img src="/brand-mark.svg" alt="" width="34" height="34" loading="lazy" decoding="async" />
              <strong>观自在</strong>
            </Link>
            <h2>读典籍，先回到原文。</h2>
            <p>
              公开源码不附带真实书籍或生产内容。部署者应只发布已获授权的文本，并分别展示原文信任等级与发布状态。
            </p>
            <div className="site-footer-badges" aria-label="当前边界">
              <span>源码仅附原创功能样例</span>
              <span>AI 白话仅供辅助</span>
              <span>未核授权不展示正文</span>
            </div>
          </div>

          <div className="site-footer-right">
            <Link className="site-footer-update" href="/updates" prefetch={false}>
              <span>
                <FileClock aria-hidden="true" />
                最近更新
              </span>
              <strong>{latest.title}</strong>
              <small>
                {latest.date} · {latest.type}
                <ArrowRight aria-hidden="true" />
              </small>
            </Link>

            <nav className="site-footer-groups" aria-label="页脚导航">
              {groups.map((group) => (
                <div className="site-footer-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <div>
                    {group.links.map((link) => (
                      <Link key={link.href} href={link.href} prefetch={false}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>观自在 · 典籍对照阅读</span>
          <span>准确、可核验、不发挥。更新记录用于说明内容与功能变更。</span>
        </div>
      </div>
    </footer>
  )
}
