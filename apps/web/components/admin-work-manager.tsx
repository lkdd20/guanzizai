'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'

type VerificationStatus = 'unverified' | 'reviewing' | 'verified' | 'rejected'
type PublicationStatus = 'hidden' | 'catalog_only' | 'published'

interface Work {
  id: string
  title: string
  author: string | null
  dynasty: string | null
  category: string | null
  library: string
  sourceBatch: string
  sourceVerification: VerificationStatus
  publicationStatus: PublicationStatus
  sourceEdition: string
  sourcePath: string
  characterCount: number
  passageCount: number
  readingStartSequence: number
  sourceNoteCount: number
  glossaryTermCount: number
  duplicateSourceNoteCount: number
  termMentionCount: number
  displayableTermMentionCount: number
  termCoveredPassageCount: number
  termCoverageRatio: number
  orphanTermCount: number
  machineDraftTermCount: number
  reviewedTermCount: number
}

interface AdminWorkManagerProps {
  endpoint: string
}

const verificationLabels: Record<VerificationStatus, string> = {
  unverified: '未核验',
  reviewing: '核验中',
  verified: '已核验',
  rejected: '已驳回',
}

const publicationLabels: Record<PublicationStatus, string> = {
  hidden: '后台隐藏',
  catalog_only: '仅显示书目',
  published: '公开阅读',
}

function workForm(work: Work) {
  return {
    title: work.title,
    author: work.author ?? '',
    dynasty: work.dynasty ?? '',
    category: work.category ?? '',
    sourceEdition: work.sourceEdition,
    sourceVerification: work.sourceVerification,
    publicationStatus: work.publicationStatus,
    readingStartSequence: String(work.readingStartSequence),
  }
}

export function AdminWorkManager({ endpoint }: AdminWorkManagerProps) {
  const [works, setWorks] = useState<Work[]>([])
  const [forms, setForms] = useState<Record<string, ReturnType<typeof workForm>>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const response = await fetch(endpoint, { cache: 'no-store' })
    const payload = (await response.json().catch(() => ({}))) as { works?: Work[]; error?: string }
    const nextWorks = payload.works ?? []
    setWorks(nextWorks)
    setForms(Object.fromEntries(nextWorks.map((work) => [work.id, workForm(work)])))
    if (!response.ok) setMessage(payload.error ?? '内容库暂时不可用。')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  function updateForm(id: string, key: keyof ReturnType<typeof workForm>, value: string) {
    setForms((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))
  }

  async function save(work: Work) {
    const form = forms[work.id]
    if (!form) return
    setBusy(work.id)
    setMessage('')
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: work.id, ...form, readingStartSequence: Number(form.readingStartSequence) }),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    setMessage(response.ok ? `《${form.title}》已保存。` : payload.error ?? '保存失败。')
    setBusy('')
    if (response.ok) await load()
  }

  if (loading) return <p className="text-muted-foreground">正在读取内容库…</p>
  if (!works.length) {
    return (
      <div className="admin-empty-state">
        <p>当前数据库没有返回可编辑作品。</p>
        <small>请确认内容库开关、数据库连接和后台权限；原创演示文本由站点内容层管理。</small>
      </div>
    )
  }

  return (
    <div className="admin-work-manager">
      {message ? <p className="admin-translation-message" role="status">{message}</p> : null}
      <div className="admin-work-list">
        {works.map((work) => {
          const form = forms[work.id]
          if (!form) return null
          return (
            <details className="admin-work-editor" key={work.id}>
              <summary>
                <span>
                  <strong>{work.title}</strong>
                  <small>
                    {work.library} · {work.passageCount.toLocaleString('zh-CN')} 段 · {work.glossaryTermCount} 个去重术语 · {(work.termCoverageRatio * 100).toFixed(1)}% 段落覆盖
                  </small>
                </span>
                <span className={`admin-work-status is-${work.publicationStatus}`}>
                  {publicationLabels[work.publicationStatus]}
                </span>
              </summary>
              <div className="admin-term-quality" aria-label={`${work.title}术语质量`}>
                <div>
                  <span>原始注释</span>
                  <strong>{work.sourceNoteCount.toLocaleString('zh-CN')}</strong>
                  <small>数据包记录</small>
                </div>
                <div>
                  <span>去重词条</span>
                  <strong>{work.glossaryTermCount.toLocaleString('zh-CN')}</strong>
                  <small>{work.duplicateSourceNoteCount.toLocaleString('zh-CN')} 条重复已合并</small>
                </div>
                <div>
                  <span>出现位置</span>
                  <strong>{work.termMentionCount.toLocaleString('zh-CN')}</strong>
                  <small>{work.displayableTermMentionCount.toLocaleString('zh-CN')} 处可用于阅读提示</small>
                </div>
                <div>
                  <span>段落覆盖</span>
                  <strong>{(work.termCoverageRatio * 100).toFixed(1)}%</strong>
                  <small>{work.termCoveredPassageCount.toLocaleString('zh-CN')} / {work.passageCount.toLocaleString('zh-CN')} 段</small>
                </div>
                <div>
                  <span>人工审核</span>
                  <strong>{work.reviewedTermCount} / {work.glossaryTermCount}</strong>
                  <small>{work.machineDraftTermCount} 个机器草稿 · {work.orphanTermCount} 个未绑定</small>
                </div>
                <div className="admin-term-coverage" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, work.termCoverageRatio * 100))}%` }} />
                </div>
              </div>
              <div className="admin-work-editor-grid">
                <label>
                  <span>作品标题</span>
                  <input value={form.title} onChange={(event) => updateForm(work.id, 'title', event.target.value)} />
                </label>
                <label>
                  <span>作者</span>
                  <input value={form.author} onChange={(event) => updateForm(work.id, 'author', event.target.value)} />
                </label>
                <label>
                  <span>朝代</span>
                  <input value={form.dynasty} onChange={(event) => updateForm(work.id, 'dynasty', event.target.value)} />
                </label>
                <label>
                  <span>分类</span>
                  <input value={form.category} onChange={(event) => updateForm(work.id, 'category', event.target.value)} />
                </label>
                <label className="admin-work-editor-wide">
                  <span>来源版本</span>
                  <input value={form.sourceEdition} onChange={(event) => updateForm(work.id, 'sourceEdition', event.target.value)} />
                </label>
                <label>
                  <span>来源核验</span>
                  <select value={form.sourceVerification} onChange={(event) => updateForm(work.id, 'sourceVerification', event.target.value)}>
                    {Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>发布状态</span>
                  <select value={form.publicationStatus} onChange={(event) => updateForm(work.id, 'publicationStatus', event.target.value)}>
                    {Object.entries(publicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>阅读起始段</span>
                  <input min="0" type="number" value={form.readingStartSequence} onChange={(event) => updateForm(work.id, 'readingStartSequence', event.target.value)} />
                </label>
              </div>
              <div className="admin-work-editor-footer">
                <span><Check aria-hidden="true" />核验状态：{verificationLabels[form.sourceVerification]}</span>
                <Button size="sm" type="button" disabled={busy === work.id} onClick={() => save(work)}>
                  {busy === work.id ? <Loader2 className="admin-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                  {busy === work.id ? '保存中' : '保存修改'}
                </Button>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
