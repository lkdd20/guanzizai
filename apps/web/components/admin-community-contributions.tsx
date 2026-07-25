'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

interface Item { id: string; kind: string; work_title: string; contributor_name: string; organization_name?: string; contributor_email: string; title: string; description: string; source_name?: string; source_url?: string; license_note: string; public_credit: boolean; status: string; attachment_name?: string; attachment_content_type?: string; attachment_bytes?: number; attachment_sha256?: string; attachment_status?: string }

const kindLabel: Record<string, string> = { source_text: '原文版本', translation_resource: '译文资源', correction: '勘误异文', authorization: '授权资料', institution: '机构共建', bug_report: 'Bug 反馈' }

export function AdminCommunityContributions() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  async function load() {
    const response = await fetch('/api/admin/contributions', { cache: 'no-store' })
    const payload = response.ok ? await response.json() : { contributions: [] }
    setItems(payload.contributions ?? []); setLoading(false)
  }
  useEffect(() => { void load() }, [])
  async function update(id: string, status: string) {
    await fetch('/api/admin/contributions', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
    await load()
  }
  if (loading) return <p className="text-muted-foreground">正在读取共建资料…</p>
  if (!items.length) return <p className="text-muted-foreground">目前没有共建资料提交。</p>
  return <div className="admin-contribution-list">{items.map((item) => <article className="admin-contribution-item" key={item.id}>
    <div className="admin-contribution-head"><strong>{item.work_title} · {kindLabel[item.kind] ?? item.kind}</strong><span>{item.status}</span></div>
    <h3>{item.title}</h3><p className="admin-contribution-translation">{item.description}</p>
    <small>{item.contributor_name}{item.organization_name ? ` · ${item.organization_name}` : ''} · {item.contributor_email}{item.source_name ? ` · ${item.source_name}` : ''}</small>
    <small>{item.license_note}</small>
    {item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">查看来源</a> : null}
    {item.attachment_status === 'uploaded' && item.attachment_name ? <div className="admin-contribution-attachment"><div><strong>{item.attachment_name}</strong><small>{item.attachment_content_type || '未知类型'} · {((item.attachment_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB · SHA-256 {item.attachment_sha256?.slice(0, 12)}…</small></div><Button asChild size="sm" variant="outline"><a href={`/api/admin/contributions/${item.id}/file`}>下载附件</a></Button></div> : null}
    <div className="admin-contribution-actions">
      <Button size="sm" variant="outline" onClick={() => update(item.id, 'reviewing')}>开始审核</Button>
      <Button size="sm" onClick={() => update(item.id, 'accepted')}>采用</Button>
      <Button size="sm" variant="secondary" onClick={() => update(item.id, 'needs_changes')}>需补充</Button>
      <Button size="sm" variant="ghost" onClick={() => update(item.id, 'rejected')}>不采用</Button>
    </div>
  </article>)}</div>
}
