'use client'

import { useEffect, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface Contribution {
  id: string
  work_title: string
  sequence: number
  original_text: string
  translation_text: string
  contributor_name: string
  source_type: string
  source_name?: string
  license_note: string
  status: string
}

export function AdminTranslationContributions() {
  const [items, setItems] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const response = await fetch('/api/admin/translations/contributions', { cache: 'no-store' })
    const payload = response.ok ? await response.json() : { contributions: [] }
    setItems(payload.contributions ?? [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function review(id: string, action: 'approve' | 'needs_changes' | 'reject') {
    const note = action === 'approve' ? '' : window.prompt('审核说明（投稿人可见）') ?? ''
    await fetch('/api/admin/translations/contributions', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, note }),
    })
    await load()
  }

  if (loading) return <p className="text-muted-foreground">正在读取译文投稿…</p>
  if (!items.length) return <p className="text-muted-foreground">目前没有译文投稿。</p>
  return (
    <div className="admin-contribution-list">
      {items.map((item) => (
        <article className="admin-contribution-item" key={item.id}>
          <div className="admin-contribution-head"><strong>{item.work_title} · 第 {item.sequence} 段</strong><span>{item.status}</span></div>
          <p className="admin-contribution-original">{item.original_text}</p>
          <p className="admin-contribution-translation">{item.translation_text}</p>
          <small>{item.contributor_name} · {item.source_type}{item.source_name ? ` · ${item.source_name}` : ''} · {item.license_note}</small>
          {item.status === 'pending' || item.status === 'needs_changes' ? (
            <div className="admin-contribution-actions">
              <Button size="sm" onClick={() => review(item.id, 'approve')}><Check />采用并发布</Button>
              <Button size="sm" variant="outline" onClick={() => review(item.id, 'needs_changes')}><RotateCcw />退回修改</Button>
              <Button size="sm" variant="ghost" onClick={() => review(item.id, 'reject')}><X />不采用</Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
