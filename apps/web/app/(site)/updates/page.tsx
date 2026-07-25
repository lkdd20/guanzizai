import Link from 'next/link'
import { ArrowRight, FileClock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { updateRecords } from '@/lib/content'

export const metadata = {
  title: '更新记录',
  description: '观自在的内容、功能、出处和后台处理记录。',
}

export default function UpdatesPage() {
  return (
    <div className="site-container">
      <section className="updates-hero">
        <span className="kicker">更新记录</span>
        <h1 className="section-title">每一次内容与功能调整，都应留下可追溯的说明。</h1>
        <p className="section-copy">
          这里记录观自在的正文、白话、出处说明、后台处理和阅读功能变更。若变更影响原文或 AI 辅助内容，会在记录中单独标明。
        </p>
      </section>

      <section className="updates-list" aria-label="更新记录列表">
        {updateRecords.map((item) => (
          <article className="update-item" key={`${item.date}-${item.title}`}>
            <div className="update-date" aria-label={item.date}>
              <FileClock aria-hidden="true" />
              <time dateTime={item.date}>{item.date}</time>
            </div>
            <div className="update-card">
              <div className="update-card-head">
                <Badge className="update-type" variant="muted">
                  {item.type}
                </Badge>
                <h2>{item.title}</h2>
              </div>
              <p>{item.summary}</p>
              <div className="update-impact">
                <span>影响范围</span>
                <strong>{item.impact}</strong>
              </div>
              {item.href ? (
                <Link className="update-link" href={item.href}>
                  查看相关页面 <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
