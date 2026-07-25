'use client'

import {
  BookOpen,
  Check,
  Download,
  FileText,
  FileType2,
  LoaderCircle,
  LogIn,
  Printer,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { type SutraPassage, type SutraRecord, type WorkOutlineItem } from '@/lib/content'
import {
  defaultReaderExportSettings,
  safeExportFilename,
  type ExportContent,
  type ExportPreset,
  type ReaderExportDocument,
  type ReaderExportFormat,
  type ReaderExportSettings,
} from '@/lib/reader-export'
import { cn } from '@/lib/utils'

interface CurrentReaderSettings {
  font: 'readable' | 'classic'
  fontSize: number
  lineHeight: number
  writingDirection: 'horizontal' | 'vertical'
}

interface ReaderExportSheetProps {
  sutra: SutraRecord
  outline: WorkOutlineItem[]
  contentVersion: string
  totalPassages: number
  authenticated: boolean
  userName?: string
  currentReaderSettings: CurrentReaderSettings
}

interface PassagePage {
  passages: SutraPassage[]
  total: number
  nextAfter: number
  hasMore: boolean
}

interface ExportProgress {
  loaded: number
  total: number
  phase: 'fetching' | 'building'
}

const fullBookExportCache = new Map<string, SutraPassage[]>()
const exportPageSize = 100
const maxCachedWorks = 2

const formatOptions: Array<{ value: ReaderExportFormat; label: string; description: string; icon: typeof Printer }> = [
  { value: 'print', label: '打印 / PDF', description: '排印预览，可打印或保存 PDF', icon: Printer },
  { value: 'epub', label: 'EPUB 电子书', description: '封面、目录与分章文件', icon: BookOpen },
  { value: 'txt', label: 'TXT 纯文本', description: '兼容性优先，仍保留章节结构', icon: FileType2 },
]

const contentOptions: Array<{ value: ExportContent; label: string; description: string }> = [
  { value: 'original', label: '仅原文', description: '最干净的典籍正文' },
  { value: 'parallel', label: '原文 + 白话', description: '按段对照，保留 AI / 授权标识' },
  { value: 'annotated', label: '原文 + 注释', description: '只输出已有阅读注释' },
]

const presetOptions: Array<{ value: ExportPreset; label: string; description: string }> = [
  { value: 'classic', label: '典籍阅读', description: '舒展、留白适中' },
  { value: 'compact', label: '节省纸张', description: '紧凑但保持可读' },
  { value: 'study', label: '批注研读', description: '段号、虚线与批注留白' },
  { value: 'current', label: '跟随阅读', description: '沿用当前字体、字号与行距' },
]

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeLoadingHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function loadingPrintHtml(title: string) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><title>正在整理 ${escapeLoadingHtml(title)}</title><style>body{min-height:100vh;display:grid;place-items:center;margin:0;background:#f6f0e6;color:#34271b;font-family:"Songti SC",serif}.card{text-align:center}.ring{width:30px;height:30px;margin:0 auto 18px;border:2px solid #d7c7af;border-top-color:#8b2f27;border-radius:999px;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}p{color:#766858;font-size:14px}</style></head><body><div class="card"><div class="ring"></div><strong>正在整理全书排印页</strong><p>完成后会在此显示打印预览</p></div></body></html>`
}

function failedPrintHtml(title: string, message: string) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><title>${escapeLoadingHtml(title)} · 排印未完成</title><style>body{min-height:100vh;display:grid;place-items:center;margin:0;background:#f6f0e6;color:#34271b;font-family:system-ui,sans-serif}.card{width:min(420px,calc(100vw - 40px));border-top:2px solid #8b2f27;background:#fffdfa;padding:28px;box-shadow:0 16px 50px rgba(55,37,18,.1)}h1{margin:0;font:500 22px/1.4 "Songti SC",serif}p{margin:12px 0 0;color:#766858;font-size:14px;line-height:1.7}button{margin-top:22px;border:0;border-radius:5px;background:#8b2f27;color:#fff;padding:10px 18px;cursor:pointer}</style></head><body><main class="card"><h1>排印预览没有完成</h1><p>${escapeLoadingHtml(message)}</p><button type="button" onclick="window.close()">关闭窗口</button></main></body></html>`
}

function settingsForPreset(
  preset: ExportPreset,
  current: CurrentReaderSettings,
  previous: ReaderExportSettings,
): ReaderExportSettings {
  const shared = { ...previous, preset }
  if (preset === 'compact') {
    return { ...shared, font: 'readable', fontSize: 16, lineHeight: 1.65, direction: 'horizontal', margin: 'narrow', showSegmentNumbers: false, divider: 'none', annotationLines: 0 }
  }
  if (preset === 'study') {
    return { ...shared, content: previous.content === 'parallel' ? 'parallel' : 'annotated', font: 'readable', fontSize: 18, lineHeight: 2.05, direction: 'horizontal', margin: 'wide', showSegmentNumbers: true, divider: 'dashed', annotationLines: 2 }
  }
  if (preset === 'current') {
    return { ...shared, font: current.font, fontSize: current.fontSize, lineHeight: current.lineHeight, direction: current.writingDirection, margin: 'standard', divider: 'none', annotationLines: 0 }
  }
  return { ...shared, font: 'classic', fontSize: 19, lineHeight: 1.9, direction: 'horizontal', margin: 'standard', showSegmentNumbers: false, divider: 'none', annotationLines: 0 }
}

function mergePassages(pages: SutraPassage[][]) {
  const byId = new Map<string, SutraPassage>()
  for (const page of pages) {
    for (const passage of page) byId.set(passage.id, passage)
  }
  return [...byId.values()].sort((left, right) => left.seq - right.seq)
}

function cacheCompleteBook(key: string, passages: SutraPassage[]) {
  fullBookExportCache.delete(key)
  while (fullBookExportCache.size >= maxCachedWorks) {
    const oldest = fullBookExportCache.keys().next().value as string | undefined
    if (!oldest) break
    fullBookExportCache.delete(oldest)
  }
  fullBookExportCache.set(key, passages)
}

function exportConcurrencyForDevice() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (connection?.saveData) return 1
  if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return 1
  if (connection?.effectiveType === '3g' || navigator.hardwareConcurrency <= 4) return 2
  return 4
}

export function ReaderExportSheet({
  sutra,
  outline,
  contentVersion,
  totalPassages,
  authenticated,
  userName,
  currentReaderSettings,
}: ReaderExportSheetProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ReaderExportFormat>('print')
  const [settings, setSettings] = useState<ReaderExportSettings>(defaultReaderExportSettings)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const cacheKey = `${sutra.id}:${contentVersion}`
  const selectedFormat = formatOptions.find((item) => item.value === format) ?? formatOptions[0]
  const previewSections = useMemo(() => Math.max(1, outline.filter((item) => item.kind === 'chapter' || item.kind === 'section').length || sutra.juanCount), [outline, sutra.juanCount])

  useEffect(() => () => {
    abortRef.current?.abort()
    workerRef.current?.terminate()
  }, [])

  function updateSettings(next: Partial<ReaderExportSettings>) {
    setSettings((current) => ({ ...current, ...next }))
  }

  async function requestPage(after: number, signal: AbortSignal) {
    const params = new URLSearchParams({ after: String(after), limit: String(exportPageSize), v: contentVersion, shape: 'notes-keywords-v2' })
    const response = await fetch(`/api/content/works/${encodeURIComponent(sutra.id)}/passages?${params}`, { signal })
    if (!response.ok) throw new Error(response.status === 404 ? '作品当前不可导出。' : '正文读取失败，请稍后重试。')
    return response.json() as Promise<PassagePage>
  }

  async function loadCompleteBook(signal: AbortSignal) {
    if (!sutra.paginated) {
      setProgress({ loaded: sutra.passages.length, total: sutra.passages.length, phase: 'fetching' })
      return [...sutra.passages].sort((left, right) => left.seq - right.seq)
    }
    const cached = fullBookExportCache.get(cacheKey)
    if (cached?.length === totalPassages) {
      setProgress({ loaded: cached.length, total: cached.length, phase: 'fetching' })
      return cached
    }

    const first = await requestPage(0, signal)
    const total = first.total || totalPassages
    const pages: SutraPassage[][] = [first.passages]
    setProgress({ loaded: first.passages.length, total, phase: 'fetching' })
    const firstAfter = first.nextAfter || first.passages.at(-1)?.seq || 0
    const remainingPageCount = Math.max(0, Math.ceil((total - first.passages.length) / exportPageSize))
    const starts = Array.from({ length: remainingPageCount }, (_, index) => firstAfter + index * exportPageSize)
    const concurrency = exportConcurrencyForDevice()
    let loadedCount = first.passages.length

    for (let index = 0; index < starts.length; index += concurrency) {
      const batch = starts.slice(index, index + concurrency)
      const results = await Promise.all(batch.map((after) => requestPage(after, signal)))
      pages.push(...results.map((result) => result.passages))
      loadedCount += results.reduce((sum, result) => sum + result.passages.length, 0)
      setProgress({ loaded: Math.min(loadedCount, total), total, phase: 'fetching' })
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    }

    let complete = mergePassages(pages)
    if (complete.length !== total) {
      const sequentialPages = [first.passages]
      const seen = new Set(first.passages.map((passage) => passage.id))
      let after = firstAfter
      while (seen.size < total) {
        const page = await requestPage(after, signal)
        if (!page.passages.length || page.nextAfter <= after) break
        sequentialPages.push(page.passages)
        page.passages.forEach((passage) => seen.add(passage.id))
        after = page.nextAfter
        setProgress({ loaded: Math.min(seen.size, total), total, phase: 'fetching' })
      }
      complete = mergePassages(sequentialPages)
    }
    if (complete.length !== total) throw new Error(`全文完整性检查未通过：应有 ${total} 段，实际取得 ${complete.length} 段。`)
    cacheCompleteBook(cacheKey, complete)
    return complete
  }

  async function loadCompleteOutline(signal: AbortSignal) {
    if (outline.length || !sutra.paginated) return outline
    const params = new URLSearchParams({ v: contentVersion })
    const response = await fetch(`/api/content/works/${encodeURIComponent(sutra.id)}/outline?${params}`, { signal })
    if (!response.ok) return []
    const payload = await response.json() as { outline?: WorkOutlineItem[] }
    return payload.outline ?? []
  }

  async function buildExportFallback(
    exportFormat: ReaderExportFormat,
    exportDocument: ReaderExportDocument,
    exportSettings: ReaderExportSettings,
  ) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    const builders = await import('@/lib/reader-export')
    return builders.buildReaderExportPayload(exportFormat, exportDocument, exportSettings)
  }

  function buildExportInWorker(
    exportFormat: ReaderExportFormat,
    exportDocument: ReaderExportDocument,
    exportSettings: ReaderExportSettings,
    signal: AbortSignal,
  ): Promise<string | ArrayBuffer> {
    if (typeof Worker === 'undefined') return buildExportFallback(exportFormat, exportDocument, exportSettings)

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/reader-export.worker.ts', import.meta.url), {
        name: 'guanzizai-reader-export',
        type: 'module',
      })
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      workerRef.current?.terminate()
      workerRef.current = worker

      const cleanup = () => {
        signal.removeEventListener('abort', handleAbort)
        worker.terminate()
        if (workerRef.current === worker) workerRef.current = null
      }
      const handleAbort = () => {
        cleanup()
        reject(new DOMException('Export cancelled', 'AbortError'))
      }

      signal.addEventListener('abort', handleAbort, { once: true })
      worker.onerror = () => {
        cleanup()
        reject(new Error('后台排印线程启动失败，请重试。'))
      }
      worker.onmessage = (event: MessageEvent<{
        id: string
        ok: boolean
        payload?: string | ArrayBuffer
        error?: string
      }>) => {
        if (event.data.id !== requestId) return
        const { ok, payload, error: workerError } = event.data
        cleanup()
        if (!ok || payload === undefined) {
          reject(new Error(workerError || '文件生成失败。'))
          return
        }
        resolve(payload)
      }
      worker.postMessage({ id: requestId, format: exportFormat, document: exportDocument, settings: exportSettings })
    })
  }

  function cancelExport() {
    abortRef.current?.abort()
    workerRef.current?.terminate()
    workerRef.current = null
    abortRef.current = null
    setProgress(null)
  }

  async function startExport() {
    if (!authenticated) {
      window.location.assign(`/login?next=${encodeURIComponent(`/read/${sutra.id}`)}`)
      return
    }
    setError('')
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    let printWindow: Window | null = null
    if (format === 'print') {
      printWindow = window.open('', '_blank')
      if (!printWindow) {
        setError('浏览器拦截了打印预览窗口，请允许本站打开新窗口后重试。')
        abortRef.current = null
        return
      }
      printWindow.opener = null
      printWindow.document.write(loadingPrintHtml(sutra.shortTitle))
      printWindow.document.close()
    }

    try {
      const [passages, completeOutline] = await Promise.all([
        loadCompleteBook(controller.signal),
        loadCompleteOutline(controller.signal),
      ])
      if (controller.signal.aborted) return
      setProgress({ loaded: passages.length, total: passages.length, phase: 'building' })
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const exportDocument = { sutra: { ...sutra, passages }, passages, outline: completeOutline }
      const payload = await buildExportInWorker(format, exportDocument, settings, controller.signal)
      if (controller.signal.aborted) return

      if (format === 'print' && printWindow) {
        if (printWindow.closed) throw new Error('排印预览窗口已关闭，请重新打开。')
        const previewUrl = URL.createObjectURL(new Blob([String(payload)], { type: 'text/html;charset=utf-8' }))
        printWindow.location.replace(previewUrl)
        printWindow.focus()
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 120_000)
      } else if (format === 'epub') {
        downloadBlob(safeExportFilename(sutra, settings.content === 'original' ? '原文版.epub' : '阅读版.epub'), new Blob([payload], { type: 'application/epub+zip' }))
      } else {
        downloadBlob(safeExportFilename(sutra, settings.content === 'original' ? '原文版.txt' : '阅读版.txt'), new Blob([String(payload)], { type: 'text/plain;charset=utf-8' }))
      }
    } catch (exportError) {
      if (controller.signal.aborted) {
        printWindow?.close()
        return
      }
      const message = exportError instanceof Error ? exportError.message : '导出没有完成，请稍后重试。'
      if (printWindow && !printWindow.closed) {
        printWindow.document.open()
        printWindow.document.write(failedPrintHtml(sutra.shortTitle, message))
        printWindow.document.close()
      }
      setError(message)
    } finally {
      workerRef.current?.terminate()
      workerRef.current = null
      if (abortRef.current === controller) abortRef.current = null
      setProgress(null)
    }
  }

  const progressPercent = progress ? Math.round((progress.loaded / Math.max(1, progress.total)) * 100) : 0

  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (!next && progress) return
      setOpen(next)
      if (!next) setError('')
    }}>
      <SheetTrigger asChild>
        <Button className="read-action-button" variant="ghost" size="compactIcon" aria-label="导出与排印">
          <Download />
        </Button>
      </SheetTrigger>
      <SheetContent className="reader-export-sheet" side="right" aria-describedby="reader-export-description">
        <SheetHeader className="reader-export-header">
          <div className="reader-export-header-mark"><FileText aria-hidden="true" /></div>
          <div>
            <SheetTitle>导出与排印</SheetTitle>
            <SheetDescription id="reader-export-description">{sutra.shortTitle} · 全书 {totalPassages.toLocaleString('zh-CN')} 段</SheetDescription>
          </div>
        </SheetHeader>

        <div className="reader-export-body">
          {!authenticated ? (
            <div className="reader-export-login-note">
              <LogIn aria-hidden="true" />
              <div><strong>登录后导出完整典籍</strong><p>阅读不受影响；登录用于限制大批量文件生成并保存账户操作边界。</p></div>
            </div>
          ) : (
            <div className="reader-export-account"><Check aria-hidden="true" /> 已登录 · {userName || '用户'}</div>
          )}

          <section className="reader-export-section">
            <div className="reader-export-section-title"><strong>输出方式</strong><small>选择最终使用场景</small></div>
            <div className="reader-export-format-grid">
              {formatOptions.map((item) => {
                const Icon = item.icon
                return (
                  <button type="button" key={item.value} data-active={format === item.value ? 'true' : undefined} onClick={() => setFormat(item.value)}>
                    <span><Icon aria-hidden="true" /></span><strong>{item.label}</strong><small>{item.description}</small>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="reader-export-section">
            <div className="reader-export-section-title"><strong>导出内容</strong><small>白话会保留真实来源标签</small></div>
            <div className="reader-export-choice-list">
              {contentOptions.map((item) => (
                <button type="button" key={item.value} data-active={settings.content === item.value ? 'true' : undefined} onClick={() => updateSettings({ content: item.value })}>
                  <span className="reader-export-radio">{settings.content === item.value ? <Check aria-hidden="true" /> : null}</span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </button>
              ))}
            </div>
          </section>

          <section className="reader-export-section">
            <div className="reader-export-section-title"><strong>版式预设</strong><small>{format === 'txt' ? 'TXT 不保留字体样式，但会保留章节与段号' : '可以在下方继续微调'}</small></div>
            <div className="reader-export-preset-grid">
              {presetOptions.map((item) => (
                <button type="button" key={item.value} data-active={settings.preset === item.value ? 'true' : undefined} onClick={() => setSettings((current) => settingsForPreset(item.value, currentReaderSettings, current))}>
                  <strong>{item.label}</strong><small>{item.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={cn('reader-export-section reader-export-controls', format === 'txt' && 'is-muted')}>
            <div className="reader-export-section-title"><strong>排印细节</strong><small>{settings.direction === 'vertical' ? '纵书为 Beta，建议先预览再打印' : '横排兼容性最好'}</small></div>
            <div className="reader-export-control-grid">
              <label><span>字体</span><select value={settings.font} disabled={format === 'txt'} onChange={(event) => updateSettings({ font: event.target.value as ReaderExportSettings['font'], preset: 'current' })}><option value="readable">舒适宋体</option><option value="classic">古籍字体</option></select></label>
              <label><span>排版方向</span><select value={settings.direction} disabled={format === 'txt'} onChange={(event) => updateSettings({ direction: event.target.value as ReaderExportSettings['direction'], preset: 'current' })}><option value="horizontal">横排（推荐）</option><option value="vertical">纵书 Beta</option></select></label>
              <label><span>字号 · {settings.fontSize}px</span><input type="range" min="14" max="26" step="1" value={settings.fontSize} disabled={format === 'txt'} onChange={(event) => updateSettings({ fontSize: Number(event.target.value), preset: 'current' })} /></label>
              <label><span>行距 · {settings.lineHeight.toFixed(1)}</span><input type="range" min="1.4" max="2.4" step="0.1" value={settings.lineHeight} disabled={format === 'txt'} onChange={(event) => updateSettings({ lineHeight: Number(event.target.value), preset: 'current' })} /></label>
              {format === 'print' ? (
                <>
                  <label><span>纸张</span><select value={settings.paper} onChange={(event) => updateSettings({ paper: event.target.value as ReaderExportSettings['paper'] })}><option value="A4">A4</option><option value="A5">A5</option><option value="B5">B5</option></select></label>
                  <label><span>页边距</span><select value={settings.margin} onChange={(event) => updateSettings({ margin: event.target.value as ReaderExportSettings['margin'] })}><option value="narrow">窄</option><option value="standard">标准</option><option value="wide">宽</option></select></label>
                </>
              ) : null}
              <label><span>段间分隔</span><select value={settings.divider} disabled={format === 'txt'} onChange={(event) => updateSettings({ divider: event.target.value as ReaderExportSettings['divider'] })}><option value="none">无</option><option value="solid">细线</option><option value="dashed">虚线</option></select></label>
              <label><span>批注留白</span><select value={settings.annotationLines} onChange={(event) => updateSettings({ annotationLines: Number(event.target.value) as ReaderExportSettings['annotationLines'] })}><option value="0">无</option><option value="1">1 行</option><option value="2">2 行</option><option value="3">3 行</option></select></label>
            </div>
            <div className="reader-export-switches">
              {([
                ['showCover', '封面'],
                ['showToc', '目录'],
                ['sectionBreaks', '卷章分页'],
                ['showSegmentNumbers', '段落编号'],
              ] as const).map(([key, label]) => (
                <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => updateSettings({ [key]: event.target.checked })} /><span>{label}</span></label>
              ))}
            </div>
          </section>

          <section className="reader-export-preview" aria-label="导出效果摘要">
            <div className="reader-export-paper-mini">
              <span>观自在 · 典藏</span><strong>{sutra.shortTitle}</strong><i></i><i></i><i></i>
            </div>
            <div><small>预计结构</small><strong>{previewSections.toLocaleString('zh-CN')} 个卷章 · {totalPassages.toLocaleString('zh-CN')} 段</strong><p>{selectedFormat.description}。导出前会读取并核对全书，不会只使用当前屏幕已加载的段落。</p></div>
          </section>

          {error ? <p className="reader-export-error">{error}</p> : null}
        </div>

        {progress ? (
          <div className="reader-export-progress" role="status" aria-live="polite">
            <div className="reader-export-progress-head"><span><LoaderCircle aria-hidden="true" />{progress.phase === 'fetching' ? '正在整理全书正文' : '正在生成排印文件'}</span><strong>{progressPercent}%</strong></div>
            <div className="reader-export-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
            <p>{progress.phase === 'fetching' ? `已核对 ${progress.loaded.toLocaleString('zh-CN')} / ${progress.total.toLocaleString('zh-CN')} 段` : '章节、目录与版式正在写入，请稍候。'}</p>
            <button type="button" onClick={cancelExport}><X aria-hidden="true" />取消</button>
          </div>
        ) : null}

        <SheetFooter className="reader-export-footer">
          <p>{format === 'print' ? '先打开排印预览，再由浏览器打印或保存 PDF。' : format === 'epub' ? 'EPUB 会按卷章拆分，适合电子书阅读器。' : 'TXT 适合检索与跨设备保存，不保留视觉样式。'}</p>
          <Button type="button" onClick={() => void startExport()} disabled={Boolean(progress)}>
            {authenticated ? <Download aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            {authenticated ? (format === 'print' ? '打开排印预览' : `生成 ${selectedFormat.label}`) : '登录后继续'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
