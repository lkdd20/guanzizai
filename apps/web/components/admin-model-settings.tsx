'use client'

import { Cpu, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

interface ModelOption {
  id: string
  ownedBy?: string
  created?: number
}

interface ModelSettingsPayload {
  model: string
  environmentModel: string
  source: 'runtime' | 'environment'
  storageAvailable: boolean
  models: ModelOption[]
  listError?: string
  gatewayHost: string
  fetchedAt: string
}

export function AdminModelSettings({ endpoint }: { endpoint: string }) {
  const [payload, setPayload] = useState<ModelSettingsPayload | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadModels = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) throw new Error('load_failed')
      const next = (await response.json()) as ModelSettingsPayload
      setPayload(next)
      setSelectedModel(next.model)
    } catch {
      setMessage('模型列表暂时无法读取，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const options = useMemo(() => {
    if (!payload) return []
    return payload.models.some((item) => item.id === payload.model)
      ? payload.models
      : [{ id: payload.model }, ...payload.models]
  }, [payload])

  async function saveModel(reset = false) {
    if (!payload?.storageAvailable || saving) return
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reset ? { reset: true } : { model: selectedModel }),
      })
      const result = (await response.json().catch(() => null)) as Partial<ModelSettingsPayload> & { error?: string } | null
      if (!response.ok || !result?.model) throw new Error(result?.error ?? 'save_failed')
      const next = { ...payload, ...result }
      setPayload(next)
      setSelectedModel(result.model)
      setMessage(reset ? '已恢复环境变量中的默认模型。' : `已切换为 ${result.model}，下一轮实时问答生效。`)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setMessage(code === 'model_not_available' ? '所选模型已不在网关列表中，请刷新后重选。' : '模型切换未保存，请检查数据库与网关状态。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-model-settings">
      <div className="admin-model-settings-head">
        <div>
          <span>运行时模型</span>
          <strong>{payload?.model ?? '正在读取'}</strong>
          <small>
            {payload ? `${payload.source === 'runtime' ? '后台选择' : '环境默认'} · ${payload.gatewayHost}` : 'API Key 只在服务端使用'}
          </small>
        </div>
        <span className="admin-model-icon" aria-hidden="true"><Cpu /></span>
      </div>

      <label className="admin-model-select">
        <span>典籍助手实时问答模型</span>
        <select
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
          disabled={loading || !options.length}
        >
          {!options.length ? <option value="">暂无可选模型</option> : null}
          {options.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}{model.ownedBy ? ` · ${model.ownedBy}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="admin-model-actions">
        <Button type="button" variant="outline" onClick={() => void loadModels()} disabled={loading || saving}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />刷新列表
        </Button>
        <Button type="button" onClick={() => void saveModel(false)} disabled={!payload?.storageAvailable || !selectedModel || selectedModel === payload.model || saving}>
          <Save />保存切换
        </Button>
        <Button type="button" variant="ghost" onClick={() => void saveModel(true)} disabled={!payload?.storageAvailable || payload.source === 'environment' || saving}>
          <RotateCcw />恢复环境默认
        </Button>
      </div>

      <p className={payload?.listError || message ? 'admin-model-message is-warn' : 'admin-model-message'} role="status">
        {message || payload?.listError || (payload?.storageAvailable
          ? `已获取 ${payload.models.length} 个模型；切换只影响典籍助手实时问答。`
          : '数据库设置表尚不可用；当前继续使用环境默认模型。')}
      </p>
    </div>
  )
}
