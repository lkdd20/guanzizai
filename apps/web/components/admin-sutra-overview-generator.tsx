'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface Draft {
  summary: string
  evidence: string[]
  mode: 'model' | 'local'
  model: string
  generatedAt: string
  persisted: false
  note: string
}

interface AdminSutraOverviewGeneratorProps {
  endpoint: string
  sutraTitle: string
}

function isDraft(value: Draft | { error?: string }): value is Draft {
  return typeof (value as Draft).summary === 'string' && Array.isArray((value as Draft).evidence)
}

export function AdminSutraOverviewGenerator({ endpoint, sutraTitle }: AdminSutraOverviewGeneratorProps) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(endpoint, { method: 'POST' })
      const data = (await response.json()) as Draft | { error?: string }
      if (!response.ok || !isDraft(data)) throw new Error('error' in data ? data.error : '生成失败')
      setDraft(data)
    } catch {
      setError('生成预览失败。请确认后台登录仍有效，并检查模型环境变量。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-generate-box">
      <div>
        <strong>单篇生成预览</strong>
        <span>仅处理《{sutraTitle}》，不会批量消耗 token，也不会自动写入内容库。</span>
      </div>
      <Button className="admin-fill-button" type="button" onClick={generate} disabled={loading}>
        {loading ? <Loader2 className="admin-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        {loading ? '生成中' : '生成概览'}
      </Button>
      {error ? <p className="admin-generate-error">{error}</p> : null}
      {draft ? (
        <article className="admin-generated-preview">
          <div>
            <span>{draft.mode === 'model' ? `${draft.model} 生成预览` : '本地概览预览'}</span>
            <time dateTime={draft.generatedAt}>{new Date(draft.generatedAt).toLocaleString('zh-CN')}</time>
          </div>
          <p>{draft.summary}</p>
          {draft.evidence.length ? (
            <small>依据：{draft.evidence.join('、')}</small>
          ) : (
            <small>未返回可绑定依据，发布前需要人工补齐。</small>
          )}
          <small>{draft.note}</small>
        </article>
      ) : null}
    </div>
  )
}
