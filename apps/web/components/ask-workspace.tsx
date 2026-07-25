'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  Clipboard,
  CornerDownLeft,
  Download,
  History,
  Info,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { addVerifiedInlineCitations, formatAskAnswerMarkdown, inlineCitationExcerpt } from '@/lib/ask-answer-format'
import { askAgentProfile } from '@/lib/ask-agent-profile'
import { type AskExperience, type AskSuggestedQuestion } from '@/lib/ask-experience'
import { ZhaoxinAvatar } from '@/components/zhaoxin-avatar'

interface AskSource {
  id: string
  ref: string
  quote: string
  href: string
  confidence: number
  verification?: 'verified' | 'unverified'
}

interface AskResponse {
  answer: string
  citationLayout?: 'curated'
  sources: AskSource[]
  mode: 'local' | 'model' | 'preset'
  note: string
  agent: {
    name: string
    displayName?: string
    role?: string
    version: string
    status: 'answerable' | 'partially_answerable' | 'clarification_needed' | 'out_of_scope' | 'no_evidence'
    scope: string
    model: string
  }
  trace: Array<{
    id: string
    label: string
    status: 'done' | 'skipped' | 'limited'
    detail: string
  }>
  preset?: {
    id: string
    answerVersion: string
    generatedAt: string
    reviewStatus: 'ai_generated_unreviewed'
  }
  guest?: { limit: number; used: number; remaining: number }
}

interface AskUserMessage {
  id: string
  role: 'user'
  content: string
  createdAt: string
}

interface AskAssistantMessage {
  id: string
  role: 'assistant'
  response: AskResponse | null
  visibleAnswer: string
  createdAt: string
  loading?: boolean
}

type AskMessage = AskUserMessage | AskAssistantMessage

interface AskStoredThread {
  id: string
  title: string
  updatedAt: string
  messages: AskMessage[]
}

const requestTimeoutMs = 45000
const fallbackTimeoutMs = 10000
const presetTransitionMs = 900
const storageKey = 'guanzizai:ask-thread:v1'
const historyStorageKey = 'guanzizai:ask-history:v1'
const maxStoredMessages = 40
const maxStoredThreads = 20

const initialResponse: AskResponse = {
  mode: 'local',
  note: '照心会优先检索观自在典藏；没有命中站内原文时，仍会提供明确标注的通识解释。',
  agent: {
    name: askAgentProfile.internalName,
    displayName: askAgentProfile.name,
    role: askAgentProfile.role,
    version: askAgentProfile.version,
    status: 'partially_answerable',
    scope: 'catalog-first',
    model: 'local-grounded-rules',
  },
  trace: [
    { id: 'classify_question', label: '范围判断', status: 'done', detail: '优先检索观自在典藏。' },
    { id: 'search_passages', label: '典藏检索', status: 'skipped', detail: '尚未提出问题。' },
    { id: 'attach_sources', label: '出处绑定', status: 'skipped', detail: '有原文命中时显示出处。' },
  ],
  answer: '',
  sources: [],
}

const initialMessages: AskMessage[] = []

function serviceErrorResponse(question: string): AskResponse {
  return {
    mode: 'local',
    note: '本轮连接中断，没有生成新回答。',
    agent: {
      name: askAgentProfile.internalName,
      displayName: askAgentProfile.name,
      role: askAgentProfile.role,
      version: askAgentProfile.version,
      status: 'no_evidence',
      scope: 'service-error',
      model: 'local-grounded-rules',
    },
    trace: [
      { id: 'normalize_question', label: '问题规范化', status: 'done', detail: `输入长度 ${question.length} 字` },
      { id: 'search_passages', label: '典藏检索', status: 'skipped', detail: '服务暂不可用，未完成检索。' },
      { id: 'generate_grounded_answer', label: '生成回答', status: 'limited', detail: '未生成无依据回答。' },
    ],
    answer: `### 本轮连接中断\n\n关于“${question}”，这次请求未能完成检索与回答。\n\n请重新发送一次，或先进入观自在典藏阅读相关作品。`,
    sources: [],
  }
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safeMarkdownUrl(value: string) {
  if (value.startsWith('/') || value.startsWith('#')) return value
  if (/^https?:\/\//i.test(value)) return value
  return ''
}

function normalizeStoredMessages(value: unknown): AskMessage[] | undefined {
  if (!Array.isArray(value)) return undefined
  const messages = value
    .filter((message): message is AskMessage => {
      if (!message || typeof message !== 'object') return false
      const candidate = message as Partial<AskMessage>
      if (candidate.role === 'user') return typeof candidate.content === 'string'
      if (candidate.role === 'assistant') {
        return typeof candidate.visibleAnswer === 'string' && Boolean(candidate.response?.answer)
      }
      return false
    })
    .slice(-maxStoredMessages)
    .map((message) => {
      if (message.role !== 'assistant' || !message.response?.sources.length) return message
      const answer = message.response.citationLayout === 'curated'
        ? formatAskAnswerMarkdown(message.response.answer)
        : addVerifiedInlineCitations(message.response.answer, message.response.sources)
      return {
        ...message,
        response: { ...message.response, answer },
        visibleAnswer: answer,
      }
    })
  return messages.length ? messages : undefined
}

function threadTitle(messages: AskMessage[]) {
  const firstQuestion = messages.find((message): message is AskUserMessage => message.role === 'user')?.content.trim()
  if (!firstQuestion) return '未命名对话'
  return firstQuestion.length > 28 ? `${firstQuestion.slice(0, 28)}…` : firstQuestion
}

function normalizeStoredThreads(value: unknown): AskStoredThread[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((thread) => {
    if (!thread || typeof thread !== 'object') return []
    const candidate = thread as Partial<AskStoredThread>
    if (typeof candidate.id !== 'string' || typeof candidate.updatedAt !== 'string') return []
    const messages = normalizeStoredMessages(candidate.messages)
    if (!messages) return []
    return [{
      id: candidate.id,
      title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : threadTitle(messages),
      updatedAt: candidate.updatedAt,
      messages,
    }]
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, maxStoredThreads)
}

function latestAssistant(messages: AskMessage[]) {
  return [...messages].reverse().find((message): message is AskAssistantMessage => message.role === 'assistant')
}

function exportMessageText(message: AskMessage, index: number) {
  if (message.role === 'user') return `### 问题 ${index + 1}\n${message.content}`
  if (!message.response) return '### 回答生成中\n'
  return [
    `### 回答 ${index + 1}`,
    message.response.answer,
    '',
    ...message.response.sources.map((source, sourceIndex) => `[${sourceIndex + 1}] ${source.ref}${source.verification === 'unverified' ? ' · 原文待复核' : ''}\n${source.quote}`),
  ].join('\n')
}

function exportConversationText(messages: AskMessage[]) {
  let questionCount = 0
  let answerCount = 0
  return messages.map((message) => {
    if (message.role === 'user') {
      questionCount += 1
      return `### 问题 ${questionCount}\n${message.content}`
    }
    answerCount += 1
    return exportMessageText(message, answerCount - 1)
  })
}

export function AskWorkspace({ experience }: { experience: AskExperience }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<AskMessage[]>(initialMessages)
  const [threadId, setThreadId] = useState('')
  const [storedThreads, setStoredThreads] = useState<AskStoredThread[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [streamingMessageId, setStreamingMessageId] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [evidenceMessageId, setEvidenceMessageId] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [guestRemaining, setGuestRemaining] = useState(3)
  const [guestLimitReached, setGuestLimitReached] = useState(false)
  const [questionBatchIndex, setQuestionBatchIndex] = useState(0)
  const streamTimerRef = useRef<number | null>(null)
  const assistantRefs = useRef<Record<string, HTMLElement | null>>({})
  const evidencePanelRef = useRef<HTMLElement | null>(null)
  const pendingAssistantScrollRef = useRef<string | null>(null)

  const activeAssistant = latestAssistant(messages)
  const activeResponse = activeAssistant?.response ?? initialResponse
  const selectedEvidenceMessage = messages.find(
    (message): message is AskAssistantMessage => message.role === 'assistant' && message.id === evidenceMessageId,
  ) ?? activeAssistant
  const selectedEvidenceResponse = selectedEvidenceMessage?.response ?? activeResponse
  const selectedEvidenceLoading = Boolean(selectedEvidenceMessage?.loading)
  const suggestedQuestionBatches = experience.suggestedQuestionBatches.length
    ? experience.suggestedQuestionBatches
    : [[{ id: 'question-sample-summary', question: '这段原文和辅助释文分别表达了什么？' } satisfies AskSuggestedQuestion]]
  const suggestedQuestions = suggestedQuestionBatches[questionBatchIndex % suggestedQuestionBatches.length]
  const conversationText = useMemo(
    () =>
      [
        '观自在问 · 本地对话导出',
        `${askAgentProfile.name} · ${askAgentProfile.role}`,
        `导出时间：${new Date().toLocaleString('zh-CN')}`,
        '说明：回答仅供辅助理解，以原文和明确出处为准。',
        '',
        ...exportConversationText(messages),
      ].join('\n\n'),
    [messages],
  )

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { authenticated?: boolean }) => setAuthenticated(Boolean(payload.authenticated)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1181px)')
    setEvidenceOpen(desktop.matches)
    const syncEvidence = (event: MediaQueryListEvent) => setEvidenceOpen(event.matches)
    desktop.addEventListener('change', syncEvidence)
    return () => desktop.removeEventListener('change', syncEvidence)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          const stored = normalizeStoredMessages(parsed)
          if (stored) setMessages(stored)
        } else if (parsed && typeof parsed === 'object') {
          const current = parsed as { id?: unknown; messages?: unknown }
          const stored = normalizeStoredMessages(current.messages)
          if (stored) setMessages(stored)
          if (typeof current.id === 'string') setThreadId(current.id)
        }
      }
      const historyRaw = localStorage.getItem(historyStorageKey)
      if (historyRaw) setStoredThreads(normalizeStoredThreads(JSON.parse(historyRaw)))
    } catch (err) {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(historyStorageKey)
    } finally {
      setThreadId((current) => current || createMessageId('thread'))
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || loading || streamingMessageId) return
    const trimmedMessages = messages
      .filter((message) => message.role === 'user' || Boolean(message.response))
      .slice(-maxStoredMessages)
    if (!threadId) return
    localStorage.setItem(storageKey, JSON.stringify({ id: threadId, messages: trimmedMessages }))
    if (!trimmedMessages.some((message) => message.role === 'user')) return
    const updatedAt = new Date().toISOString()
    const nextThread: AskStoredThread = {
      id: threadId,
      title: threadTitle(trimmedMessages),
      updatedAt,
      messages: trimmedMessages,
    }
    setStoredThreads((current) => [nextThread, ...current.filter((thread) => thread.id !== threadId)].slice(0, maxStoredThreads))
  }, [hydrated, loading, messages, streamingMessageId, threadId])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(historyStorageKey, JSON.stringify(storedThreads))
  }, [hydrated, storedThreads])

  useEffect(() => {
    const assistantId = pendingAssistantScrollRef.current
    if (!assistantId) return
    const target = assistantRefs.current[assistantId]
    if (!target) return

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
      pendingAssistantScrollRef.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages])

  useEffect(() => {
    return () => clearStreamTimer()
  }, [])

  function clearStreamTimer() {
    if (!streamTimerRef.current) return
    window.clearInterval(streamTimerRef.current)
    streamTimerRef.current = null
  }

  function streamAnswer(messageId: string, answer: string) {
    clearStreamTimer()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'assistant' ? { ...message, visibleAnswer: answer } : message,
        ),
      )
      setStreamingMessageId('')
      return
    }

    let index = 0
    const step = Math.max(1, Math.ceil(answer.length / 180))
    setStreamingMessageId(messageId)
    streamTimerRef.current = window.setInterval(() => {
      index = Math.min(answer.length, index + step)
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'assistant'
            ? { ...message, visibleAnswer: answer.slice(0, index) }
            : message,
        ),
      )
      if (index >= answer.length) {
        clearStreamTimer()
        setStreamingMessageId('')
      }
    }, 18)
  }

  function conversationContext() {
    return messages
      .filter((message) => {
        if (message.role === 'user') return message.content.trim()
        return message.response?.answer.trim()
      })
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.role === 'user' ? message.content : message.response?.answer ?? message.visibleAnswer,
      }))
  }

  async function ask(nextQuestion = question, presetId?: string) {
    const q = nextQuestion.trim()
    if (!q || loading) return
    const requestStartedAt = Date.now()
    const userMessage: AskUserMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: q,
      createdAt: new Date().toISOString(),
    }
    const assistantId = createMessageId('assistant')
    const assistantPlaceholder: AskAssistantMessage = {
      id: assistantId,
      role: 'assistant',
      response: null,
      visibleAnswer: '',
      createdAt: new Date().toISOString(),
      loading: true,
    }
    const history = conversationContext()

    pendingAssistantScrollRef.current = assistantId
    setMessages((current) => [...current, userMessage, assistantPlaceholder].slice(-maxStoredMessages))
    setQuestion('')
    setLoading(true)
    setError('')
    setCopiedId('')

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      let result = presetId
        ? await fetch(`/api/ask/presets/${encodeURIComponent(presetId)}?question=${encodeURIComponent(q)}`, {
            cache: 'default',
            signal: controller.signal,
          })
        : undefined
      if (!result?.ok) {
        result = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ question: q, history }),
        })
      }
      if (result.status === 403) {
        const payload = (await result.json().catch(() => null)) as { error?: string; guest?: { remaining?: number } } | null
        if (payload?.error === 'guest_limit') {
          setGuestRemaining(0)
          setGuestLimitReached(true)
          pendingAssistantScrollRef.current = null
          setMessages((current) => current.filter((message) => message.id !== assistantId))
          return
        }
      }
      if (!result.ok) throw new Error('ask failed')
      const data = (await result.json()) as AskResponse
      if (data.mode === 'preset' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const remainingTransition = presetTransitionMs - (Date.now() - requestStartedAt)
        if (remainingTransition > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingTransition))
        }
      }
      if (data.guest) {
        setGuestRemaining(data.guest.remaining)
        setGuestLimitReached(data.guest.remaining <= 0)
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && message.role === 'assistant'
            ? { ...message, response: data, visibleAnswer: '', loading: false }
            : message,
        ),
      )
      if (data.sources.length) setEvidenceMessageId(assistantId)
      streamAnswer(assistantId, data.answer)
    } catch (err) {
      const fallbackController = new AbortController()
      const fallbackTimeout = window.setTimeout(() => fallbackController.abort(), fallbackTimeoutMs)
      try {
        const fallbackResult = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: fallbackController.signal,
          body: JSON.stringify({ question: q, history, mode: 'local' }),
        })
        if (!fallbackResult.ok) throw new Error('fallback failed')
        const fallback = (await fallbackResult.json()) as AskResponse
        setError('实时连接较慢，本轮已先返回基础解释。')
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? { ...message, response: fallback, visibleAnswer: '', loading: false }
              : message,
          ),
        )
        if (fallback.sources.length) setEvidenceMessageId(assistantId)
        streamAnswer(assistantId, fallback.answer)
      } catch {
        const fallback = serviceErrorResponse(q)
        setError('当前连接中断，请稍后重试。')
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? { ...message, response: fallback, visibleAnswer: '', loading: false }
              : message,
          ),
        )
        streamAnswer(assistantId, fallback.answer)
      } finally {
        window.clearTimeout(fallbackTimeout)
      }
    } finally {
      window.clearTimeout(timeout)
      setLoading(false)
    }
  }

  async function copyAnswer(message: AskAssistantMessage) {
    if (!message.response) return
    try {
      await navigator.clipboard.writeText(exportMessageText(message, 0))
      setCopiedId(message.id)
      window.setTimeout(() => setCopiedId(''), 1600)
    } catch (err) {
      setCopiedId('')
    }
  }

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function downloadAnswer(message: AskAssistantMessage) {
    if (!message.response) return
    downloadText(`guanzizai-ask-answer-${Date.now()}.txt`, exportMessageText(message, 0))
  }

  function downloadConversation() {
    downloadText(`guanzizai-ask-thread-${Date.now()}.txt`, conversationText)
  }

  function resetQuestion() {
    clearStreamTimer()
    setQuestion('')
    setMessages([])
    setError('')
    setCopiedId('')
    setFeedback({})
    setStreamingMessageId('')
    setEvidenceMessageId('')
    setEvidenceOpen(window.matchMedia('(min-width: 1181px)').matches)
    setThreadId(createMessageId('thread'))
    pendingAssistantScrollRef.current = null
    setHistoryOpen(false)
  }

  function openStoredThread(thread: AskStoredThread) {
    clearStreamTimer()
    setThreadId(thread.id)
    setMessages(thread.messages)
    setQuestion('')
    setError('')
    setStreamingMessageId('')
    setEvidenceMessageId(latestAssistant(thread.messages)?.id ?? '')
    setEvidenceOpen(window.matchMedia('(min-width: 1181px)').matches)
    setHistoryOpen(false)
  }

  function deleteStoredThread(id: string) {
    setStoredThreads((current) => current.filter((thread) => thread.id !== id))
    if (id === threadId) resetQuestion()
  }

  function formattedThreadTime(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function rotateQuestionBatch() {
    setQuestionBatchIndex((current) => (current + 1) % suggestedQuestionBatches.length)
  }

  function messageIdsForTurn(messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId)
    if (index < 0) return []
    const message = messages[index]
    if (message.role === 'user') {
      const next = messages[index + 1]
      return [message.id, ...(next?.role === 'assistant' ? [next.id] : [])]
    }
    const previous = messages[index - 1]
    return [ ...(previous?.role === 'user' ? [previous.id] : []), message.id]
  }

  function deleteConversationTurn(messageId: string) {
    const ids = new Set(messageIdsForTurn(messageId))
    if (ids.has(streamingMessageId)) {
      clearStreamTimer()
      setStreamingMessageId('')
    }
    setMessages((current) => current.filter((message) => !ids.has(message.id)))
    if (ids.has(evidenceMessageId)) setEvidenceMessageId('')
    setFeedback((current) => {
      const next = { ...current }
      ids.forEach((id) => delete next[id])
      return next
    })
  }

  function revealEvidence(messageId: string) {
    setEvidenceMessageId(messageId)
    setEvidenceOpen(true)
    window.requestAnimationFrame(() => {
      const panel = evidencePanelRef.current
      if (!panel) return
      panel.focus({ preventScroll: true })
      if (window.matchMedia('(min-width: 1181px)').matches) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panel.animate(
          [
            { boxShadow: '0 0 0 0 rgba(153, 104, 37, 0)' },
            { boxShadow: '0 0 0 4px rgba(153, 104, 37, 0.24)' },
            { boxShadow: '0 0 0 0 rgba(153, 104, 37, 0)' },
          ],
          { duration: 760, easing: 'ease-out' },
        )
      }
    })
  }

  function renderAssistantMessage(message: AskAssistantMessage) {
    const response = message.response
    const isStreaming = streamingMessageId === message.id
    const agentName = response?.agent.displayName ?? askAgentProfile.name
    const hasSources = Boolean(response?.sources.length)
    const isGeneralAnswer = response?.agent.status === 'partially_answerable' && !hasSources

    return (
      <article
        ref={(element) => {
          assistantRefs.current[message.id] = element
        }}
        className="ask-answer-card"
        aria-busy={message.loading || isStreaming}
        data-loading={message.loading ? 'true' : undefined}
      >
        <button
          type="button"
          className="ask-message-dismiss"
          aria-label="删除这轮对话"
          title="删除这轮对话"
          onClick={() => deleteConversationTurn(message.id)}
        >
          <X aria-hidden="true" />
        </button>
        <div className="ask-answer-head">
          <ZhaoxinAvatar size="md" state={message.loading ? 'searching' : hasSources ? 'citing' : 'limited'} />
          <div>
            <span className="kicker">{agentName}</span>
            <h2>{message.loading ? '正在理解你的问题' : hasSources ? '先看原文，再谈理解' : '先把问题讲清楚'}</h2>
          </div>
        </div>

        <div className="ask-answer-body" data-streaming={isStreaming ? 'true' : undefined}>
          {message.loading ? (
            <div className="ask-thinking-block" role="status" aria-live="polite">
              <div className="ask-thinking">
                <span>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {askAgentProfile.name}正在检索典藏并核对原文
                </span>
              </div>
              <div className="ask-thinking-progress" aria-hidden="true"><span /></div>
            </div>
          ) : message.visibleAnswer ? (
            <div className="ask-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={safeMarkdownUrl}
                components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}
              >
                {message.visibleAnswer}
              </ReactMarkdown>
              {isStreaming ? <span className="ask-stream-caret" aria-hidden="true" /> : null}
            </div>
          ) : (
            <p>
              {isStreaming ? <span className="ask-stream-caret" aria-hidden="true" /> : null}
            </p>
          )}
        </div>

        {response?.sources.length ? (
          <div className="ask-source-block">
            <div className="ask-source-title">
              <CheckCircle2 size={16} />
              本轮引用 {response.sources.length} 条已收录原文
              <button type="button" onClick={() => revealEvidence(message.id)}>查看原文与出处</button>
            </div>
          </div>
        ) : isGeneralAnswer ? (
          <div className="ask-knowledge-boundary">
            <Info size={16} aria-hidden="true" />
            <span>本轮为通识解释，没有引用站内原文。照心不会为回答补造出处。</span>
            <Link href="/sutras">浏览典藏 <ArrowUpRight size={13} /></Link>
          </div>
        ) : null}

        {response ? (
          <div className="ask-answer-actions" aria-label="回答操作">
            <Button
              type="button"
              variant={copiedId === message.id ? 'secondary' : 'ghost'}
              size="compactIcon"
              aria-label="复制回答"
              onClick={() => copyAnswer(message)}
            >
              <Clipboard />
            </Button>
            <Button type="button" variant="ghost" size="compactIcon" aria-label="导出回答" onClick={() => downloadAnswer(message)}>
              <Download />
            </Button>
            <Button
              type="button"
              variant={feedback[message.id] === 'up' ? 'secondary' : 'ghost'}
              size="compactIcon"
              aria-label="有帮助"
              onClick={() => setFeedback((current) => ({ ...current, [message.id]: 'up' }))}
            >
              <ThumbsUp />
            </Button>
            <Button
              type="button"
              variant={feedback[message.id] === 'down' ? 'secondary' : 'ghost'}
              size="compactIcon"
              aria-label="需修正"
              onClick={() => setFeedback((current) => ({ ...current, [message.id]: 'down' }))}
            >
              <ThumbsDown />
            </Button>
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <div className="ask-workspace" data-evidence={evidenceOpen ? 'open' : 'closed'}>
      <aside className="ask-context-rail" aria-label="对话与资料范围">
        <div className="ask-agent-identity">
          <ZhaoxinAvatar size="lg" />
          <div>
            <span className="kicker">Agent</span>
            <h2>{askAgentProfile.name}</h2>
            <p>{askAgentProfile.role}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" className="ask-new-thread" onClick={resetQuestion}>
          <Plus size={16} />
          新建对话
        </Button>
        <div className="ask-context-section">
          <span>当前对话</span>
          <strong><MessageSquareText size={15} /> {messages.length ? '本地对话' : '尚未开始'}</strong>
        </div>
        <div className="ask-context-section">
          <span>可用资料</span>
          <Link href="/sutras"><BookOpenText size={15} /> 观自在典藏 · {experience.resources.length} 部</Link>
          <div className="ask-resource-list">
            {experience.resources.map((resource) => (
              <Link href={resource.href} key={resource.id}>{resource.shortTitle}</Link>
            ))}
          </div>
          <small>只引用已发布原文；未命中时提供标注清楚的通识解释。</small>
        </div>
        <div className="ask-context-foot"><ShieldCheck size={15} /> 对话仅保存在本机</div>
      </aside>
      <section className="ask-thread" aria-label="观自在问对话">
        <div className="ask-message-list">
          {messages.length ? (
            messages.map((message) =>
              message.role === 'user' ? (
                <div className="ask-user-row" key={message.id}>
                  <div className="ask-user-bubble">
                    <button
                      type="button"
                      className="ask-message-dismiss"
                      aria-label="删除这轮对话"
                      title="删除这轮对话"
                      onClick={() => deleteConversationTurn(message.id)}
                    >
                      <X aria-hidden="true" />
                    </button>
                    <span>{message.content}</span>
                  </div>
                  <span className="ask-user-avatar" role="img" aria-label="我的提问">问</span>
                </div>
              ) : (
                <div className="ask-assistant-row" key={message.id}>
                  {renderAssistantMessage(message)}
                </div>
              ),
            )
          ) : (
            <div className="ask-empty-thread">
              <span className="kicker">从问题开始</span>
              <h2>今天想读懂什么？</h2>
              <p>可以问典籍、作者、词句或文化背景。有站内原文就附出处，没有命中也会给出标注清楚的通识解释。</p>
              <Link className="ask-catalog-status" href="/sutras">
                <BookOpenText size={14} /> 当前可检索 {experience.resources.length} 部典籍
              </Link>
              <div className="ask-empty-prompt">
                <div className="ask-empty-prompt-head">
                  <span>试着问我</span>
                  <button type="button" onClick={rotateQuestionBatch} title="换一批推荐问题">
                    <RefreshCw size={14} />
                    换一批
                  </button>
                </div>
                <div className="ask-empty-question-grid">
                  {suggestedQuestions.map((sample) => (
                    <button type="button" key={sample.id} onClick={() => ask(sample.question, sample.presetId)}>
                      {sample.question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="ask-note">{error || activeResponse.note}</p>
      </section>

      <aside ref={evidencePanelRef} tabIndex={-1} className="ask-side-panel" aria-label="本轮出处" data-open={evidenceOpen ? 'true' : 'false'}>
        <div className="ask-evidence-head">
          <div><span className="kicker">原文证据</span><h2>本轮出处</h2></div>
          <button type="button" onClick={() => setEvidenceOpen(false)} aria-label="收起出处栏">×</button>
        </div>
        {selectedEvidenceLoading ? (
          <div className="ask-evidence-empty">
            <Loader2 className="animate-spin" />
            <p>正在核对与本轮问题相关的原文出处。</p>
          </div>
        ) : selectedEvidenceResponse.sources.length ? (
          <div className="ask-evidence-list">
            {selectedEvidenceResponse.sources.map((source) => {
              const excerpt = inlineCitationExcerpt(source.quote, 56)
              const truncated = excerpt.length < source.quote.trim().length
              return (
                <Link href={source.href} key={source.id} target="_blank" rel="noreferrer">
                  <span>{source.ref}{source.verification === 'unverified' ? ' · 原文待复核' : ''}</span>
                  <blockquote>{excerpt}{truncated ? '……' : ''}</blockquote>
                  <small>新窗口阅读原文 <ArrowUpRight size={13} /></small>
                </Link>
              )
            })}
          </div>
        ) : selectedEvidenceResponse.agent.status === 'partially_answerable' ? (
          <div className="ask-evidence-empty ask-evidence-general">
            <Info />
            <p>本轮回答采用通识解释，没有引用站内原文。</p>
            <Link href="/sutras">前往观自在典藏 <ArrowUpRight size={13} /></Link>
          </div>
        ) : <div className="ask-evidence-empty"><Search /><p>命中典藏原文后，支持回答的出处会在这里展示。</p></div>}
        <details className="ask-answer-details">
          <summary>查看回答边界</summary>
          <div className="ask-agent-meta">
            <span>资料方式：典藏检索优先</span>
            <span>回答内容仅作辅助理解</span>
            <span>{selectedEvidenceLoading ? '正在核对本轮出处' : selectedEvidenceResponse.sources.length ? '本轮有站内原文出处' : '通识解释不冒充原文证据'}</span>
          </div>
        </details>
      </aside>

      <form
        className="ask-composer"
        data-has-messages={messages.length ? 'true' : 'false'}
        onSubmit={(event) => {
          event.preventDefault()
          ask()
        }}
      >
        {guestLimitReached && !authenticated ? (
          <div className="ask-guest-gate" role="status">
            <div><strong>游客体验已完成</strong><span>登录后可继续对话，并在账户中管理阅读与共建记录。</span></div>
            <Button asChild size="sm"><Link href="/login?next=/ask">登录</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/register?next=/ask">注册</Link></Button>
          </div>
        ) : <>
        <div className="ask-composer-tools">
          <Button type="button" variant="ghost" className="ask-composer-action" onClick={() => setHistoryOpen(true)}>
            <History /><span>历史对话</span>
          </Button>
          <Button type="button" variant="ghost" className="ask-composer-action" onClick={resetQuestion}>
            <Plus /><span>开启新对话</span>
          </Button>
          <Button type="button" variant="ghost" className="ask-composer-action" onClick={downloadConversation} disabled={!messages.length}>
            <Download /><span>下载对话</span>
          </Button>
        </div>
        <textarea
          aria-label="提出您的问题"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            ask()
          }}
          placeholder="提出您的问题..."
          rows={2}
        />
        <Button className="ask-submit" type="submit" size="icon" aria-label="发送" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <CornerDownLeft />}
        </Button>
        <p>{authenticated ? '当前对话仅保存在本机浏览器。' : `游客可体验 3 轮，当前剩余 ${guestRemaining} 轮；登录后可继续。`}</p>
        </>}
      </form>

      <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="ask-history-overlay" />
          <Dialog.Content className="ask-history-dialog" aria-describedby="ask-history-description">
            <header className="ask-history-head">
              <div>
                <span className="kicker">仅保存在本机</span>
                <Dialog.Title>历史对话</Dialog.Title>
                <Dialog.Description id="ask-history-description">最近保存的对话，可继续阅读或接着提问。</Dialog.Description>
              </div>
              <Dialog.Close aria-label="关闭历史对话" title="关闭"><X /></Dialog.Close>
            </header>
            {storedThreads.length ? (
              <div className="ask-history-list">
                {storedThreads.map((thread) => (
                  <div className="ask-history-row" key={thread.id} data-active={thread.id === threadId ? 'true' : undefined}>
                    <button type="button" onClick={() => openStoredThread(thread)}>
                      <strong>{thread.title}</strong>
                      <span>{formattedThreadTime(thread.updatedAt)} · {thread.messages.filter((message) => message.role === 'user').length} 个问题</span>
                    </button>
                    <button type="button" className="ask-history-delete" aria-label={`删除对话：${thread.title}`} title="删除对话" onClick={() => deleteStoredThread(thread.id)}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ask-history-empty"><History /><p>还没有历史对话。提出第一个问题后，会自动保存在这里。</p></div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
