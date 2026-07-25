import 'server-only'

import { inspectTranslation } from './translation-quality'

export const translationPromptVersion = 'classical-fiction-zh-hans-v3'

export interface TranslationContext {
  workTitle: string
  sectionTitle: string | null
  previousText: string | null
  originalText: string
  nextText: string | null
}

function excerpt(value: string | null, maxLength: number) {
  if (!value) return '（无）'
  const characters = [...value.trim()]
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}……` : characters.join('')
}

export async function generateTranslationDraft(context: TranslationContext) {
  const apiKey = process.env.NEWAPI_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim()
  const baseUrl = process.env.NEWAPI_BASE_URL?.trim().replace(/\/+$/, '')
  const model = process.env.NEWAPI_MODEL?.trim()
  if (!apiKey || !baseUrl || !model) throw new Error('model_not_configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 50_000)
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: [
              '你是中国古典小说白话译文的初译助手。',
              '忠实逐意翻译目标原文，不增补情节、心理、评价、考据或解释。',
              '保留人名、地名、官名及人物关系；对话仍写成对话；不遗漏否定、转折、时间与数量。',
              '原文中独立成行的篇名、卷名必须原样保留，不得白话化；同一目标段落跨越两篇时，保留篇名分隔并完整翻译两部分。',
              '上下文只用于辨认指代和语气，绝不能翻译进目标段落。',
              '只输出目标原文的现代汉语译文，不输出标题、原文、注释、Markdown 或说明。',
            ].join(''),
          },
          {
            role: 'user',
            content: [
              `作品：${context.workTitle}`,
              `篇章：${context.sectionTitle || '正文'}`,
              `上文（仅供理解）：${excerpt(context.previousText, 500)}`,
              `目标原文：${context.originalText}`,
              `下文（仅供理解）：${excerpt(context.nextText, 300)}`,
            ].join('\n\n'),
          },
        ],
      }),
    })
    if (!response.ok) throw new Error(`model_http_${response.status}`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('model_empty')
    return { content, model, qualityReport: inspectTranslation(context.originalText, content) }
  } finally {
    clearTimeout(timer)
  }
}
