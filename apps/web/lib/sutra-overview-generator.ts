import { askAgentConfigFromEnv, modelRequestHeaders } from '@/lib/ask-agent'
import { sutraStats, type SutraRecord } from '@/lib/content'

export interface SutraOverviewDraft {
  sutraId: string
  title: string
  summary: string
  evidence: string[]
  mode: 'model' | 'local'
  model: string
  generatedAt: string
  persisted: false
  note: string
}

const generationTimeoutMs = 35000

export async function generateSutraOverviewDraft(sutra: SutraRecord, now = new Date()): Promise<SutraOverviewDraft> {
  const config = askAgentConfigFromEnv()
  const fallback = buildLocalDraft(sutra, config.model, now)
  if (!config.apiKey) return fallback

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), generationTimeoutMs)
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: modelRequestHeaders(config.apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.15,
        max_tokens: 520,
        messages: [
          {
            role: 'system',
            content:
              '你是观自在的古籍内容编辑。只能依据用户提供的作品元数据、原文和段落信息写简介；不要补写未给出的历史影响、作者评价或不可核验结论。只返回 JSON，不要返回 Markdown 或 HTML。',
          },
          {
            role: 'user',
            content: buildPrompt(sutra),
          },
        ],
      }),
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) return fallback
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const parsed = parseModelContent(data.choices?.[0]?.message?.content)
    if (!parsed?.summary) return fallback

    return {
      sutraId: sutra.id,
      title: `关于${sutra.shortTitle}`,
      summary: normalizeSummary(parsed.summary),
      evidence: normalizeEvidence(parsed.evidence, sutra),
      mode: 'model',
      model: config.model,
      generatedAt: now.toISOString(),
      persisted: false,
      note: '这是后台单篇生成预览，尚未写入内容库；发布前仍需要人工复核。',
    }
  } catch {
    return fallback
  }
}

function buildPrompt(sutra: SutraRecord) {
  const stats = sutraStats(sutra)
  const sourceText = sutra.passages.map((passage) => `〔${passage.sourceRef}〕${passage.original}`).join('\n')
  return `请为下面这部经典生成“标题下方简介”。

要求：
- 用现代中文，沉静、准确、可核验。
- 只写 130 到 220 个汉字。
- 不能写未提供的历史影响、宗派地位、神秘效果或修行承诺。
- 必须提醒“以原文为准”。
- 返回 JSON：{"summary":"...","evidence":["段落出处1","段落出处2"]}。

元数据：
ID：${sutra.id}
题名：${sutra.title}
简称：${sutra.shortTitle}
类别：${sutra.category}
朝代与译者：${sutra.dynasty} · ${sutra.translator}译
底本：${sutra.sourceEdition}
原文字数：${stats.originalCharCount}
段落数：${stats.passageCount}

原文：
${sourceText}`
}

function buildLocalDraft(sutra: SutraRecord, model: string, now: Date): SutraOverviewDraft {
  return {
    sutraId: sutra.id,
    title: `关于${sutra.shortTitle}`,
    summary: sutra.overview.summary,
    evidence: sutra.passages.slice(0, 3).map((passage) => passage.sourceRef),
    mode: 'local',
    model: 'local-curated-overview',
    generatedAt: now.toISOString(),
    persisted: false,
    note: model
      ? '当前没有可用模型结果，已返回本地人工整理概览；发布前仍需要人工复核。'
      : '未配置模型密钥，已返回本地人工整理概览。',
  }
}

function parseModelContent(content: string | undefined) {
  if (!content) return undefined
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as { summary?: unknown; evidence?: unknown }
  } catch {
    return { summary: cleaned, evidence: [] }
  }
}

function normalizeSummary(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, 320)
}

function normalizeEvidence(value: unknown, sutra: SutraRecord) {
  const refs = new Set(sutra.passages.map((passage) => passage.sourceRef))
  if (!Array.isArray(value)) return sutra.passages.slice(0, 3).map((passage) => passage.sourceRef)
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => refs.has(item))
    .slice(0, 4)
}
