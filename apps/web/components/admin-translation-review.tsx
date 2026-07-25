'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Send, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface WorkStatus {
  id: string
  title: string
  source_verification: string
  publication_status: string
  passage_count: number
  draft_count: number
  reviewed_count: number
  published_count: number
}

interface TranslationDraft {
  id: number
  status: 'draft' | 'reviewed' | 'published'
  content: string
  quality_report: { passed?: boolean; issues?: string[] }
  work_id: string
  work_title: string
  source_verification: string
  passage_id: string
  sequence: number
  section_title: string
  original_text: string
}

const focusWorks: WorkStatus[] = [
  { id: 'sample-work', title: '公开版原创阅读样例', source_verification: 'verified', publication_status: 'published', passage_count: 2, draft_count: 0, reviewed_count: 2, published_count: 2 },
]

export function AdminTranslationReview() {
  const [works, setWorks] = useState<WorkStatus[]>([])
  const [items, setItems] = useState<TranslationDraft[]>([])
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const response = await fetch('/api/admin/translations/review', { cache: 'no-store' })
    const payload = response.ok ? await response.json() : { works: focusWorks, translations: [] }
    setWorks(payload.works?.length ? payload.works : focusWorks)
    setItems(payload.translations ?? [])
    setEdits(Object.fromEntries((payload.translations ?? []).map((item: TranslationDraft) => [item.id, item.content])))
    if (!response.ok) setMessage('译文数据库尚未初始化，首次生成时会自动完成幂等迁移。')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function generate(work: WorkStatus) {
    setBusy(`generate:${work.id}`)
    setMessage(`正在为《${work.title}》生成下一段初译…`)
    const response = await fetch('/api/admin/translations/review', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workId: work.id, limit: 1 }),
    })
    const payload = await response.json().catch(() => ({}))
    const firstError = payload.errors?.[0]?.error ? `；首个错误：${payload.errors[0].error}` : ''
    setMessage(response.ok
      ? `已生成 ${payload.completed ?? 0} 段草稿${firstError}。`
      : `生成失败：${payload.error ?? '服务暂不可用'}`)
    setBusy('')
    if (response.ok) await load()
  }

  async function review(item: TranslationDraft, action: 'review' | 'publish') {
    setBusy(`${action}:${item.id}`)
    const response = await fetch('/api/admin/translations/review', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id, content: edits[item.id], action }),
    })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok
      ? action === 'publish' ? '译文已发布；原文核验状态仍单独展示。' : '人工审校稿已保存，可以进入发布步骤。'
      : payload.error === 'translation_not_reviewed' ? '译文必须先保存为人工审校稿。' : `操作失败：${payload.error ?? '未知错误'}`)
    setBusy('')
    if (response.ok) await load()
  }

  if (loading) return <p className="text-muted-foreground">正在读取译文审校队列…</p>
  return (
    <div className="admin-translation-review">
      <div className="admin-translation-work-grid">
        {works.map((work) => (
          <article key={work.id}>
            <div><strong>《{work.title}》</strong><span>{work.source_verification} · {work.passage_count} 段</span></div>
            <p>{work.draft_count} 草稿 · {work.reviewed_count} 已审 · {work.published_count} 已发布</p>
            <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => generate(work)}>
              {busy === `generate:${work.id}` ? <Loader2 className="animate-spin" /> : <Sparkles />}
              生成下一段初译
            </Button>
          </article>
        ))}
      </div>
      {message ? <p className="admin-translation-message" role="status">{message}</p> : null}
      <div className="admin-contribution-list">
        {items.map((item) => (
          <article className="admin-contribution-item" key={item.id}>
            <div className="admin-contribution-head">
              <strong>《{item.work_title}》· {item.section_title} · 第 {item.sequence} 段</strong>
              <span>{item.status === 'published' ? '已发布 · 可继续修订' : item.status === 'reviewed' ? '已人工审校' : item.quality_report?.passed ? 'AI 初译 · 自动检查通过' : 'AI 初译 · 需重点检查'}</span>
            </div>
            <p className="admin-contribution-original">{item.original_text}</p>
            <label className="admin-translation-editor">
              <span>白话审校稿</span>
              <textarea value={edits[item.id] ?? ''} onChange={(event) => setEdits((current) => ({ ...current, [item.id]: event.target.value }))} rows={7} />
            </label>
            <div className="admin-contribution-actions">
              {item.status !== 'published' ? (
                <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => review(item, 'review')}>
                  {busy === `review:${item.id}` ? <Loader2 className="animate-spin" /> : <Check />}保存人工审校
                </Button>
              ) : null}
              <Button size="sm" disabled={Boolean(busy) || item.status === 'draft'} onClick={() => review(item, 'publish')}>
                {busy === `publish:${item.id}` ? <Loader2 className="animate-spin" /> : <Send />}{item.status === 'published' ? '更新已发布译文' : '发布精校译文'}
              </Button>
            </div>
          </article>
        ))}
        {!items.length ? <p className="text-muted-foreground">尚无初译草稿。先从每部第一段开始。</p> : null}
      </div>
    </div>
  )
}
