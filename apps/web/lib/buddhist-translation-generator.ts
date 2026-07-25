import 'server-only'

import { parseBuddhistTranslationResponse, type GeneratedTranslationSegment } from '@/lib/buddhist-translation-quality'

export const buddhistTranslationPromptVersion = 'buddhist-close-plain-zh-hans-v2.1'

export interface BuddhistTranslationSourceSegment {
  index: number
  source: string
}

export interface BuddhistTranslationContext {
  workTitle: string
  sectionTitle: string | null
  previousText: string | null
  nextText: string | null
  terms: string[]
  segments: BuddhistTranslationSourceSegment[]
}

function excerpt(value: string | null, maxLength: number) {
  if (!value) return '（无）'
  const characters = [...value.trim()]
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}……` : characters.join('')
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function requestModel(baseUrl: string, apiKey: string, body: unknown, attempt = 0): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 80_000)
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const transientStatus = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
    if (transientStatus && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const fallbackDelay = response.status === 429
        ? 2_500 * (attempt + 1)
        : 2_000 * (2 ** attempt)
      await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : fallbackDelay)
      return requestModel(baseUrl, apiKey, body, attempt + 1)
    }
    return response
  } finally {
    clearTimeout(timer)
  }
}

export async function generateBuddhistTranslationDraft(context: BuddhistTranslationContext): Promise<{
  segments: GeneratedTranslationSegment[]
  model: string
}> {
  const apiKey = process.env.NEWAPI_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim()
  const baseUrl = process.env.NEWAPI_BASE_URL?.trim().replace(/\/+$/, '')
  const model = process.env.NEWAPI_MODEL?.trim()
  if (!apiKey || !baseUrl || !model) throw new Error('model_not_configured')

  const response = await requestModel(baseUrl, apiKey, {
    model,
    temperature: 0.1,
    messages: [
          {
            role: 'system',
            content: [
              '你是佛典近义白话初译器。目标是现代汉语语法充分白话，语义保持克制，不是简繁转换，也不是讲经或注疏。',
              '逐段完整翻译，不遗漏否定、数量、条件、因果、人物、问答关系和论证层次。可以补足现代汉语最低限度的主语和连接词，但不得加入原文未表达的义理、宗派判断、功效承诺或哲学概念。',
              '佛教专名保持稳定；需要解释的内容留给注释，不写进白话。咒语、陀罗尼和音译文字保留原文，不直接意译。篇名、品名、卷名保持原样。',
              '禁止输出“这段用现代汉语直述为”“在是至”“因这”“何所以”等机械文字，禁止输出说明、评价、Markdown、原文复述或模型身份。',
              '严格返回 JSON 对象：{"segments":[{"index":原编号,"translation":"对应白话"}]}。段数、顺序和 index 必须与输入完全一致。',
            ].join(''),
          },
          {
            role: 'user',
            content: [
              `作品：${context.workTitle}`,
              `篇章：${context.sectionTitle || '正文'}`,
              `本作品术语（按上下文保留或稳定处理）：${context.terms.join('、') || '无'}`,
              `上文（只用于辨认指代，不得译入）：${excerpt(context.previousText, 350)}`,
              `下文（只用于辨认指代，不得译入）：${excerpt(context.nextText, 250)}`,
              `待译分段 JSON：${JSON.stringify(context.segments)}`,
            ].join('\n\n'),
          },
    ],
  })
  if (!response.ok) throw new Error(`model_http_${response.status}`)
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('model_empty')
  return {
    segments: parseBuddhistTranslationResponse(content, context.segments.map((segment) => segment.index)),
    model,
  }
}
