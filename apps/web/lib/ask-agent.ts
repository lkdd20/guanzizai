import OpenCC from 'opencc-js'

import { addVerifiedInlineCitations, formatAskAnswerMarkdown, formatInlineCitationBlockquote, inlineCitationExcerpt, removeEmbeddedEvidenceMarkdown, resolveVerifiedCitationMarkers } from './ask-answer-format'
import { askAgentProfile } from './ask-agent-profile'
import {
  findAskRecommendationProfile,
  findAskStoryByPassageId,
  findAskStoryDescriptionMatches,
  findAskStoryLookup,
  findAskStoryMatches,
  isAskStoryLookupQuestion,
  recommendationEvidenceQuote,
  type AskRecommendationProfile,
  type AskStoryMatch,
} from './ask-recommendations'
import { heartSutra, searchHeartSutra, termDefinitions, type SutraPassage } from './content'
import { askModelConfigFromRuntime, modelGatewayConfigFromEnv, type ModelGatewayConfig } from './model-settings'

export type AskAgentMode = 'local' | 'model' | 'preset'
export type AskAgentStatus =
  | 'answerable'
  | 'partially_answerable'
  | 'clarification_needed'
  | 'out_of_scope'
  | 'no_evidence'
export type AskAgentStepStatus = 'done' | 'skipped' | 'limited'

export interface AskAgentSource {
  id: string
  ref: string
  quote: string
  href: string
  confidence: number
  verification?: 'verified' | 'unverified'
  passageTitle?: string
}

export interface AskAgentTraceStep {
  id: string
  label: string
  status: AskAgentStepStatus
  detail: string
}

export interface AskAgentResponse {
  answer: string
  citationLayout?: 'curated'
  sources: AskAgentSource[]
  mode: AskAgentMode
  note: string
  agent: {
    name: string
    displayName: string
    role: string
    version: string
    status: AskAgentStatus
    scope: string
    model: string
  }
  trace: AskAgentTraceStep[]
  preset?: {
    id: string
    answerVersion: string
    generatedAt: string
    reviewStatus: 'ai_generated_unreviewed'
  }
}

export interface AskConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

type AgentConfig = ModelGatewayConfig

interface QuestionScope {
  status: AskAgentStatus
  scope: string
  reason: string
}

interface AskRetrievalPlan {
  terms: string[]
  workIds: string[]
  preferredPassageIds: string[]
}

const modelTimeoutMs = 30000
const retrievalPlanningTimeoutMs = 4500
const transientModelStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
const toHans = OpenCC.Converter({ from: 'tw', to: 'cn' })
const toHant = OpenCC.Converter({ from: 'cn', to: 'tw' })

// Production catalog aliases are data and intentionally are not distributed.
// This single original sample keeps the retrieval path executable.
const catalogWorkRules = [
  { id: 'sample-work', aliases: ['阅读器演示文本', '演示文本'] },
] as const

const answerTopics = [
  {
    id: 'core',
    terms: ['核心', '主旨', '主要说', '全文', '结构'],
    anchors: ['sample-work_j1_0001', 'sample-work_j1_0002'],
    answer:
      '### 直接回答\n\n这份原创演示文本强调：先核对出处和版本，再借助辅助说明理解。\n\n> 先辨来源，再读其文；先记版本，再谈其义。\n\n### 依据边界\n\n公开仓库只附原创演示数据。接入自有或获授权内容后，问答仍会依照相同的检索、引用和核验流程运行。',
  },
]

export function askAgentConfigFromEnv(env = process.env): AgentConfig {
  return modelGatewayConfigFromEnv(env)
}

export function askAgentConfigFromRuntime(env = process.env) {
  return askModelConfigFromRuntime(env)
}

export function modelRequestHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    origin: 'https://www.guanzizai.org',
    referer: 'https://www.guanzizai.org/ask',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 guanzizai-reader/1.0',
  }
}

export function normalizeAskQuestion(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}

export function normalizeAskHistory(value: unknown): AskConversationTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .map((turn): AskConversationTurn | undefined => {
      if (!turn || typeof turn !== 'object') return undefined
      const candidate = turn as Partial<AskConversationTurn>
      if (candidate.role !== 'user' && candidate.role !== 'assistant') return undefined
      if (typeof candidate.content !== 'string') return undefined
      const content = candidate.content.trim().slice(0, 900)
      if (!content) return undefined
      return { role: candidate.role, content }
    })
    .filter((turn): turn is AskConversationTurn => Boolean(turn))
    .slice(-8)
}

export function askAgentTools() {
  return [
    {
      name: 'classify_question',
      label: '范围判断',
      detail: '判断问题需要原文证据、通识解释还是补充说明。',
    },
    {
      name: 'search_passages',
      label: '典藏检索',
      detail: '优先检索已接入问答索引的典藏原文。',
    },
    {
      name: 'lookup_terms',
      label: '术语查找',
      detail: '匹配术语解释，辅助选择证据。',
    },
    {
      name: 'generate_grounded_answer',
      label: '生成回答',
      detail: '有原文时据文回答；无原文时生成明确标注的通识解释。',
    },
    {
      name: 'attach_sources',
      label: '出处绑定',
      detail: '为回答附上原文引用和阅读页锚点。',
    },
  ]
}

export async function runGuanzizaiAskAgent(
  question: string,
  config = askAgentConfigFromEnv(),
  history: AskConversationTurn[] = [],
): Promise<AskAgentResponse> {
  const normalized = normalizeAskQuestion(question)
  const normalizedHistory = normalizeAskHistory(history)
  const trace: AskAgentTraceStep[] = [
    {
      id: 'normalize_question',
      label: '问题规范化',
      status: 'done',
      detail: `输入长度 ${normalized.length} 字`,
    },
  ]
  const scope = classifyQuestion(normalized)
  trace.push({
    id: 'classify_question',
    label: '范围判断',
    status: scope.status === 'answerable' ? 'done' : 'limited',
    detail: scope.reason,
  })

  if (scope.status === 'clarification_needed') {
    trace.push(
      {
        id: 'search_passages',
        label: '经文检索',
        status: 'skipped',
        detail: '问题指代不明确，等待用户补充原句或对象。',
      },
      {
        id: 'generate_grounded_answer',
        label: '生成回答',
        status: 'limited',
        detail: '缺少明确对象时不猜测用户意图。',
      },
    )
    return buildResponse({
      answer: `### 请再补充一点\n\n“${normalized}”里的指代还不够明确。你可以贴出原句、书名或前后文，我会先帮你确认在问什么，再决定是回到典藏原文，还是给出通识解释。`,
      sources: [],
      mode: 'local',
      note: '问题指代不明确，照心先等待补充，不猜测对象。',
      status: scope.status,
      scope: scope.scope,
      model: config.model,
      trace,
    })
  }

  const questionVariants = queryVariants(normalized)
  const storyLookupIntent = isAskStoryLookupQuestion(questionVariants)
  const storyLookup = findAskStoryLookup(questionVariants)
  const recommendationProfile = storyLookupIntent ? undefined : findAskRecommendationProfile(questionVariants)
  const directStoryMatch = storyLookup || recommendationProfile ? undefined : findAskStoryMatches(questionVariants)[0]
  const describedStoryMatch = storyLookup || recommendationProfile || directStoryMatch
    ? undefined
    : findAskStoryDescriptionMatches(questionVariants)[0]
  const storyMatch = directStoryMatch ?? describedStoryMatch
  const focusedStory = storyLookup ?? storyMatch
  const sources = await selectSources(normalized, config, recommendationProfile)
  trace.push({
    id: 'search_passages',
    label: '经文检索',
    status: sources.length ? 'done' : 'limited',
    detail: sources.length ? `命中 ${sources.length} 条原文片段` : '未找到能够支持回答的原文片段。',
  })
  const matchedTerms = lookupTerms(normalized)
  trace.push({
    id: 'lookup_terms',
    label: '术语查找',
    status: matchedTerms.length ? 'done' : 'skipped',
    detail: matchedTerms.length ? `匹配术语：${matchedTerms.join('、')}` : '没有额外术语命中。',
  })

  const curatedRecommendationFallback = recommendationProfile
    ? buildCuratedRecommendationAnswer(recommendationProfile, sources)
    : ''

  const modelResult: { answer?: string; error?: string } = await askModel(
    normalized,
    sources,
    config,
    normalizedHistory,
    recommendationProfile,
    storyLookup,
    storyLookupIntent,
    describedStoryMatch,
  ).catch((error: unknown) => ({
    error: modelErrorMessage(error),
  }))
  const modelAnswer = modelResult.answer
    && isEvidenceConsistentModelAnswer(modelResult.answer, sources)
    && hasValidEvidenceDecision(modelResult.answer, sources)
    && (!recommendationProfile || isUsableRecommendationModelAnswer(modelResult.answer, recommendationProfile, sources))
    && (!storyLookup || isUsableStoryLookupModelAnswer(modelResult.answer, storyLookup, sources))
    && (!storyLookupIntent || storyLookup || !sources.some((source) => source.passageTitle) || isUsablePassageLookupModelAnswer(modelResult.answer, sources))
    && (!storyMatch || isUsableStoryModelAnswer(modelResult.answer, storyMatch, sources))
    ? modelResult.answer
    : undefined
  const rejectedIncompleteModelAnswer = Boolean(modelResult.answer && !modelAnswer)
  const trustedFallbackSources = focusedStory
    ? sources.filter((source) => source.id === focusedStory.passageId)
    : findTopic(normalized) ? sources : []
  const fallbackAnswer = curatedRecommendationFallback
    || (storyLookup ? buildCuratedStoryLookupAnswer(storyLookup) : '')
    || (describedStoryMatch ? buildCuratedStoryFactAnswer(describedStoryMatch) : '')
    || (storyMatch ? buildCuratedStoryAnswer(storyMatch) : '')
    || localAnswer(normalized, trustedFallbackSources)
  const formattedAnswer = formatAskAnswerMarkdown(modelAnswer ?? fallbackAnswer)
  const resolvedCitations = modelAnswer && sources.length
    ? resolveVerifiedCitationMarkers(formattedAnswer, sources)
    : { answer: formattedAnswer, citationCount: 0, citedSourceIds: [] }
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const selectedSources = modelAnswer
    ? resolvedCitations.citedSourceIds
      .map((id) => sourceById.get(id))
      .filter((source): source is AskAgentSource => Boolean(source))
    : curatedRecommendationFallback
      ? sources.filter((source) => recommendationProfile?.stories.some((story) => story.passageId === source.id))
      : selectBestFallbackSources(normalized, trustedFallbackSources)
  const markerSafeAnswer = modelAnswer ? resolvedCitations.answer : formattedAnswer
  const answer = modelAnswer && resolvedCitations.citationCount
    ? markerSafeAnswer
    : selectedSources.length && !curatedRecommendationFallback
      ? addVerifiedInlineCitations(removeEmbeddedEvidenceMarkdown(markerSafeAnswer), selectedSources)
      : markerSafeAnswer
  const citationLayout = (curatedRecommendationFallback && !modelAnswer) || resolvedCitations.citationCount > 0
    ? 'curated' as const
    : undefined
  trace.push({
    id: 'generate_grounded_answer',
    label: '生成回答',
    status: modelAnswer || sources.length || localGeneralTopic(normalized) ? 'done' : 'limited',
    detail: modelAnswer
      ? normalizedHistory.length
        ? `模型${sources.length ? '基于典藏片段' : '按通识解释模式'}生成回答，并参考最近 ${normalizedHistory.length} 条上下文。`
        : `模型${sources.length ? '基于典藏片段' : '按通识解释模式'}生成回答。`
      : rejectedIncompleteModelAnswer && (curatedRecommendationFallback || focusedStory)
        ? '模型回答未紧扣当前任务与原文，已切换为对应篇目的原文解释。'
      : curatedRecommendationFallback
        ? '模型服务当前不可用，已切换为编辑候选降级回答。'
        : focusedStory
          ? '模型服务当前不可用，已切换为对应篇目的原文解释。'
        : sources.length ? '模型服务当前不可用，已切换为本地原文规则回答。' : '模型服务当前不可用，已给出本地基础解释。',
  })
  trace.push({
    id: 'attach_sources',
    label: '出处绑定',
    status: selectedSources.length ? 'done' : 'skipped',
    detail: selectedSources.length
      ? `已绑定回答实际采用的 ${selectedSources.length} 条原文。`
      : sources.length ? '候选原文未被回答采用，不作为本轮出处展示。' : '本轮为通识解释，没有伪造站内出处。',
  })

  return buildResponse({
    answer,
    citationLayout,
    sources: selectedSources,
    mode: modelAnswer ? 'model' : 'local',
    note: selectedSources.length
      ? '本轮回答有站内原文依据，可从出处卡片返回阅读页核验。'
      : '本轮为通识解释，未引用站内原文；照心不会把一般知识伪装成典藏出处。',
    status: selectedSources.length ? 'answerable' : 'partially_answerable',
    scope: selectedSources.length ? recommendationProfile ? 'catalog-recommendation' : scope.scope : 'general-knowledge',
    model: config.model,
    trace,
  })
}

export function isUsableRecommendationModelAnswer(
  value: string,
  profile: AskRecommendationProfile,
  sources: AskAgentSource[],
) {
  const answer = value.trim()
  const availableStories = profile.stories.filter((story) => sources.some((source) => source.id === story.passageId))
  if (availableStories.length < 2) return true
  if (answer.length < 240) return false
  return availableStories.every((story) => (
    answer.includes(story.title) && answer.includes(`[[cite:${story.passageId}]]`)
  ))
}

export function isUsableStoryModelAnswer(value: string, story: AskStoryMatch, sources: AskAgentSource[] = []) {
  const answer = value.trim()
  const includesTitle = [story.title, ...(story.alternateTitles ?? [])].some((title) => answer.includes(title))
  if (answer.length < 80 || answer.length > 560 || !includesTitle) return false
  return !sources.some((source) => source.id === story.passageId)
    || answer.includes(`[[cite:${story.passageId}]]`)
}

export function isUsableStoryLookupModelAnswer(value: string, story: AskStoryMatch, sources: AskAgentSource[]) {
  const answer = value.trim()
  if (answer.length < 36 || answer.length > 480 || !answer.includes(story.title)) return false
  return !sources.some((source) => source.id === story.passageId)
    || answer.includes(`[[cite:${story.passageId}]]`)
}

export function isUsablePassageLookupModelAnswer(value: string, sources: AskAgentSource[]) {
  const answer = value.trim()
  const titledSources = sources.filter((source) => source.passageTitle)
  if (!titledSources.length) return answer.length >= 36
  return titledSources.some((source) => (
    answer.includes(source.passageTitle!) && answer.includes(`[[cite:${source.id}]]`)
  ))
}

export function isEvidenceConsistentModelAnswer(value: string, sources: AskAgentSource[]) {
  if (!sources.length) return true
  const declinesEvidence = value.includes('[[no_evidence]]')
  if (!declinesEvidence && /本轮(?:没有|未命中|无)站内原文|本轮未引用站内原文|没有可引用的站内原文/u.test(value)) return false
  const quotedClaims = Array.from(value.matchAll(/“([^”\n]{4,120})”/gu), (match) => match[1].trim())
  return quotedClaims.every((claim) => sources.some((source) => (
    queryVariants(source.quote).some((quote) => quote.includes(claim))
  )))
}

export function hasValidEvidenceDecision(value: string, sources: AskAgentSource[]) {
  if (!sources.length) return true
  if (value.includes('[[no_evidence]]')) {
    return /(?:候选|站内|提供的)?原文.{0,18}(?:不足|不支持|未能支持|没有直接支持|无法支持)/u.test(value)
  }
  return sources.some((source) => value.includes(`[[cite:${source.id}]]`))
}

export function selectBestFallbackSources(question: string, sources: AskAgentSource[], limit = 1) {
  const terms = databaseSearchTerms(question)
  return sources.map((source, index) => {
    const quoteVariants = queryVariants(source.quote)
    const titleVariants = source.passageTitle ? queryVariants(source.passageTitle) : []
    const score = terms.reduce((total, term) => (
      total
      + (quoteVariants.some((quote) => quote.includes(term)) ? Math.max(2, term.length) : 0)
      + (titleVariants.some((title) => title.includes(term)) ? Math.max(4, term.length * 2) : 0)
    ), 0)
    return { source, index, score }
  }).sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, Math.min(2, limit)))
    .map((item) => item.source)
}

export function buildCuratedStoryAnswer(story: AskStoryMatch) {
  return `## ${story.fallbackHeading}\n\n${story.fallbackAnalysis}\n\n${story.summary}`
}

export function buildCuratedStoryLookupAnswer(story: AskStoryMatch) {
  return `## 你找的应该是${storyTitleLabel(story)}\n\n${story.summary}\n\n${story.fallbackAnalysis}`
}

export function buildCuratedStoryFactAnswer(story: AskStoryMatch) {
  return `## 有，在${storyTitleLabel(story)}里\n\n${story.summary}\n\n${story.fallbackAnalysis}`
}

function storyTitleLabel(story: AskStoryMatch) {
  return story.alternateTitles?.length
    ? `《${story.title}》（也常写《${story.alternateTitles.join('》《')}》）`
    : `《${story.title}》`
}

function buildResponse(input: {
  answer: string
  citationLayout?: 'curated'
  sources: AskAgentSource[]
  mode: AskAgentMode
  note: string
  status: AskAgentStatus
  scope: string
  model: string
  trace: AskAgentTraceStep[]
}): AskAgentResponse {
  return {
    answer: input.answer,
    citationLayout: input.citationLayout,
    sources: input.sources,
    mode: input.mode,
    note: input.note,
    agent: {
      name: askAgentProfile.internalName,
      displayName: askAgentProfile.name,
      role: askAgentProfile.role,
      version: askAgentProfile.version,
      status: input.status,
      scope: input.scope,
      model: input.mode === 'local' ? 'local-grounded-rules' : input.model,
    },
    trace: input.trace,
  }
}

function classifyQuestion(question: string): QuestionScope {
  if (/^(这|那|它|这个|那个)(句|段|个)?(是)?(什么|什麼|啥)?意思[？?]?$/.test(question)) {
    return {
      status: 'clarification_needed',
      scope: heartSutra.id,
      reason: '问题包含不明确指代，需要原句或术语。',
    }
  }
  return {
    status: 'answerable',
    scope: 'catalog-first',
    reason: '先检索观自在典藏；未命中时转为明确标注的通识解释。',
  }
}

function queryVariants(question: string) {
  return [...new Set([question, toHans(question), toHant(question)].filter(Boolean))]
}

async function selectSources(
  question: string,
  config: AgentConfig,
  recommendationProfile?: AskRecommendationProfile,
): Promise<AskAgentSource[]> {
  const retrievalPlan = databaseRetrievalPlan(question)
  const databaseEnabled = process.env.CONTENT_DATABASE_ENABLED?.trim().toLowerCase() === 'true'
  let publishedResources: Array<{ id: string; title: string }> = []
  let resolvedWorkIds = retrievalPlan.workIds
  if (databaseEnabled && !resolvedWorkIds.length) {
    try {
      const { listPublishedAskResources } = await import('./content-db')
      publishedResources = await listPublishedAskResources()
      resolvedWorkIds = matchPublishedAskWorkIds(question, publishedResources)
    } catch {
      // Database retrieval below retains its normal general-search fallback.
    }
  }
  const passages = new Map<string, SutraPassage>()
  if (!resolvedWorkIds.length) {
    for (const variant of queryVariants(question)) {
      searchHeartSutra(variant).forEach((passage) => passages.set(passage.anchorId, passage))
    }
    const topic = findTopic(question)
    if (topic) {
      topic.anchors
        .map((anchor) => heartSutra.passages.find((passage) => passage.anchorId === anchor))
        .filter((passage): passage is SutraPassage => Boolean(passage))
        .forEach((passage) => passages.set(passage.anchorId, passage))
    }
  }
  const staticSources = Array.from(passages.values())
    .slice(0, 4)
    .map((passage, index) => ({
      id: passage.anchorId,
      ref: passage.sourceRef,
      quote: passage.original,
      href: `/read/${encodeURIComponent(heartSutra.id)}#${encodeURIComponent(passage.anchorId)}`,
      confidence: Math.max(72, 94 - index * 4),
      verification: 'verified' as const,
    }))
  if (staticSources.length >= 4 || !databaseEnabled) {
    return staticSources
  }

  try {
    const { getPublishedAskPresetPassages, searchPublishedAskPassages } = await import('./content-db')
    const matchedTitles = new Set(publishedResources
      .filter((resource) => resolvedWorkIds.includes(resource.id))
      .flatMap((resource) => queryVariants(resource.title)))
    const preferredPassageIds = recommendationProfile?.stories.map((story) => story.passageId)
      ?? retrievalPlan.preferredPassageIds
    const plannedTerms = preferredPassageIds.length || !resolvedWorkIds.length || !shouldExpandRetrievalQuery(question)
      ? []
      : await planModelRetrievalTerms(question, config)
    const searchTerms = [...new Set([...plannedTerms, ...retrievalPlan.terms])]
      .filter((term) => !matchedTitles.has(term))
      .slice(0, 20)
    const databasePassages = preferredPassageIds.length
      ? await getPublishedAskPresetPassages(preferredPassageIds)
      : await searchPublishedAskPassages(
        question,
        searchTerms,
        8 - staticSources.length,
        resolvedWorkIds,
      )
    const databaseById = new Map(databasePassages.map((passage) => [passage.passageId, passage]))
    const orderedDatabasePassages = preferredPassageIds.length
      ? preferredPassageIds.map((id) => databaseById.get(id)).filter((passage): passage is NonNullable<typeof passage> => Boolean(passage))
      : databasePassages
    return [
      ...staticSources,
      ...orderedDatabasePassages.slice(0, 8 - staticSources.length).map((passage, index) => {
        const story = findAskStoryByPassageId(passage.passageId)
        return {
          id: passage.passageId,
          ref: passage.passageTitle
            ? `《${passage.workTitle}·${passage.passageTitle}》 · 卷 ${passage.juan} · 段 ${String(passage.sequence).padStart(6, '0')}`
            : `《${passage.workTitle}》 · 卷 ${passage.juan} · 段 ${String(passage.sequence).padStart(6, '0')}`,
          quote: recommendationEvidenceQuote(passage.quote, story?.evidenceTerms ?? []),
          href: `/read/${encodeURIComponent(passage.workId)}?start=${passage.sequence}#${encodeURIComponent(passage.passageId)}`,
          confidence: Math.max(70, 90 - (staticSources.length + index) * 4),
          verification: passage.sourceVerification === 'verified' ? 'verified' as const : 'unverified' as const,
          passageTitle: passage.passageTitle,
        }
      }),
    ]
  } catch {
    return staticSources
  }
}

export function shouldExpandRetrievalQuery(question: string) {
  const variants = queryVariants(question)
  return isAskStoryLookupQuestion(variants) || variants.some((variant) => (
    /(?:有沒有|有没有|是否|有.{0,16}[嗎吗？?]|哪(?:一)?篇|叫什|為何|为何|為什|为什么|如何|怎麼|怎么)/u.test(variant)
  ))
}

export function parseModelRetrievalTerms(value: string) {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const payload = JSON.parse(value.slice(start, end + 1)) as { terms?: unknown }
    if (!Array.isArray(payload.terms)) return []
    return [...new Set(payload.terms.flatMap((item) => (
      typeof item === 'string' ? queryVariants(item.trim()) : []
    )).map((term) => term.replace(/[\s，。！？、；：,.!?;:()（）【】\[\]“”"']/gu, '').trim())
      .filter((term) => term.length >= 2 && term.length <= 16))]
      .slice(0, 12)
  } catch {
    return []
  }
}

async function planModelRetrievalTerms(question: string, config: AgentConfig) {
  if (!config.apiKey) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), retrievalPlanningTimeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: modelRequestHeaders(config.apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: '你只负责为中文古籍站内检索生成关键词，不回答用户问题。输出严格 JSON：{"terms":["词一","词二"]}。给出 4 至 8 个可能出现在篇名、原文或白话中的短词，包含同义表达和关键人物/动作；不得编造确定篇名，不要输出解释。',
          },
          { role: 'user', content: question },
        ],
      }),
    })
    if (!response.ok) return []
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return parseModelRetrievalTerms(payload.choices?.[0]?.message?.content ?? '')
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

export function matchPublishedAskWorkIds(
  question: string,
  resources: Array<{ id: string; title: string }>,
) {
  const variants = queryVariants(question)
  return resources.filter((resource) => (
    queryVariants(resource.title).some((title) => variants.some((variant) => variant.includes(title)))
  )).map((resource) => resource.id)
}

export function databaseSearchTerms(question: string) {
  const variants = queryVariants(question)
  const quotedTerms = variants.flatMap((variant) => [
    ...Array.from(variant.matchAll(/[“"]([^”"]{2,16})[”"]/gu), (match) => match[1]),
  ])
  const knownWorkAliases = new Set<string>(catalogWorkRules.flatMap((rule) => [...rule.aliases]))
  const passageTitleTerms = variants.flatMap((variant) => (
    Array.from(variant.matchAll(/《([^》]{2,18})》/gu), (match) => match[1])
  )).filter((term) => !knownWorkAliases.has(term))
  const cleanedTerms = variants.flatMap((variant) => variant
    .replace(/《[^》]+》/gu, ' ')
    .replace(/是什么意思|是什麼意思|是什幺意思|为什么|為什麼|怎么|怎麼|怎样|怎樣|如何|是否|叫什么|叫什麼|叫什幺|什么|什麼|什幺|哪一篇|哪篇|篇名|名字|意思|主要|反复|反覆|经常|經常|值得|原文|前后文|前後文|放回|理解|解释|解釋|谈到|談到|关于|關於|有一篇|一篇|写|寫|说|說|里的|中的|这个|這個|可以|应该|應該|有何|有什么|有什麼|吗|嗎/gu, ' ')
    .split(/[\s，。！？、；：,.!?;:()（）【】\[\]“”"'《》]+/u))
  return [...new Set([...quotedTerms, ...passageTitleTerms, ...cleanedTerms]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 18))]
    .slice(0, 16)
}

export function databaseRetrievalPlan(question: string): AskRetrievalPlan {
  const variants = queryVariants(question)
  const includesAny = (values: string[]) => values.some((value) => variants.some((variant) => variant.includes(value)))
  const workIds = catalogWorkRules.filter((rule) => includesAny([...rule.aliases])).map((rule) => rule.id)
  const recommendationProfile = findAskRecommendationProfile(variants)
  const storyLookup = findAskStoryLookup(variants)
  const directStoryMatches = recommendationProfile || storyLookup ? [] : findAskStoryMatches(variants)
  const describedStoryMatches = recommendationProfile || storyLookup || directStoryMatches.length
    ? []
    : findAskStoryDescriptionMatches(variants)
  const storyMatches = directStoryMatches.length ? directStoryMatches : describedStoryMatches
  return {
    terms: databaseSearchTerms(question),
    workIds,
    preferredPassageIds: storyLookup ? [storyLookup.passageId]
      : recommendationProfile?.stories.map((story) => story.passageId)
      ?? storyMatches.map((story) => story.passageId),
  }
}

export function buildCuratedRecommendationAnswer(profile: AskRecommendationProfile, sources: AskAgentSource[]) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const sections = profile.stories.flatMap((story, index) => {
    const source = sourceById.get(story.passageId)
    if (!source) return []
    const excerpt = inlineCitationExcerpt(source.quote, 82)
    if (!excerpt || !source.quote.includes(excerpt)) return []
    return [
      `### ${index + 1}. 《${story.title}》：${story.label}\n\n${story.summary}\n\n${formatInlineCitationBlockquote(excerpt, excerpt.length < source.quote.trim().length)}\n>\n> [打开《${story.title}》原文](${source.href})`,
    ]
  })
  if (sections.length < 2) return ''
  return [`## 如果先读三篇，我会这样选`, ...sections].join('\n\n')
}

function lookupTerms(question: string) {
  const variants = queryVariants(question)
  return termDefinitions
    .filter((term) => {
      const fields = [term.term, term.summary, term.note].flatMap(queryVariants)
      return variants.some((variant) => fields.some((field) => field.includes(variant) || variant.includes(field)))
    })
    .map((term) => term.term)
    .slice(0, 5)
}

function findTopic(question: string) {
  const variants = queryVariants(question)
  return answerTopics.find((topic) => topic.terms.some((term) => variants.some((variant) => variant.includes(term))))
}

function localAnswer(question: string, sources: AskAgentSource[]) {
  const topic = findTopic(question)
  if (topic) return topic.answer
  const general = localGeneralTopic(question)
  const variants = queryVariants(question)
  const mentionsSpecificPassage = sources.some((source) => (
    source.passageTitle && variants.some((variant) => variant.includes(source.passageTitle!))
  ))
  if (general && !mentionsSpecificPassage) return general
  const sourceSummary = sources.length
    ? `本次检索先定位到 ${sources.map((source) => source.ref).join('、')}。`
    : '本次没有可引用的原文片段。'
  if (sources.length) return `### 直接回答\n\n关于“${question}”，我先根据这次命中的典藏原文作一个克制说明。\n\n${sourceSummary}\n\n### 回到原文\n\n请结合下方出处阅读上下文；如果问题需要原文之外的历史背景，我会把那部分单独标成通识解释。`
  if (general) return general
  return `### 先给一个基础说明\n\n“${question}”没有命中当前问答索引中的站内原文。我仍可以从常见知识范围帮助你理解，但这部分没有可附的观自在典藏出处。\n\n### 证据边界\n\n你可以继续补充书名、原句或具体想了解的角度；我会把可核验的原文依据和一般解释分开，不拿无关段落凑出处。`
}

function localGeneralTopic(question: string) {
  void question
  return ''
}

async function askModel(
  question: string,
  sources: AskAgentSource[],
  config: AgentConfig,
  history: AskConversationTurn[],
  recommendationProfile?: AskRecommendationProfile,
  storyLookup?: AskStoryMatch,
  storyLookupIntent = false,
  describedStoryMatch?: AskStoryMatch,
): Promise<{ answer?: string; error?: string }> {
  if (!config.apiKey) return { error: '未配置模型密钥' }

  const sourceText = sources.length ? sources
    .map((source) => `[source:${source.id}] ${source.ref}${source.verification === 'unverified' ? '（原文待复核）' : ''}\n${source.quote}`)
    .join('\n\n') : '本轮没有命中站内原文。不得伪造引用或出处。'
  const historyText = history.length
    ? history.map((turn) => `${turn.role === 'user' ? '用户' : askAgentProfile.name}：${turn.content}`).join('\n')
    : '无'
  const namedSource = sources.find((source) => (
    source.passageTitle && queryVariants(question).some((variant) => variant.includes(source.passageTitle!))
  ))
  const taskInstruction = recommendationProfile
    ? `任务类型：故事推荐。候选资料是检索和编辑筛选结果，不是固定答案。请结合用户措辞，从候选中推荐 3 篇；必须使用候选中的真实篇名，每篇用一个三级标题和 2 至 3 句具体推荐理由，并在该篇理由后另起一行输出对应的 [[cite:段落ID]]。不要把问题改答成书名解释，也不要只推荐一篇。候选编辑提示：\n${recommendationProfile.stories.map((story) => `- 《${story.title}》：${story.label}；${story.summary}`).join('\n')}`
    : storyLookup
      ? `任务类型：根据描述查找篇名。已在用户指定作品内定位到候选《${storyLookup.title}》。第一句直接回答“你找的应该是《${storyLookup.title}》”，随后用一至两段具体情节说明为什么与描述相符，并另起一行输出 [[cite:${storyLookup.passageId}]]。不得改答全书概览，不得罗列其他篇名，不得声称本轮没有站内原文。`
    : storyLookupIntent && sources.some((source) => source.passageTitle)
      ? `任务类型：根据描述查找篇名。只比较下列从用户指定作品中检索出的候选：${sources.filter((source) => source.passageTitle).map((source) => `《${source.passageTitle}》[[cite:${source.id}]]`).join('、')}。选择与描述最相符的一篇，第一句直接回答篇名，再用原文中的具体情节说明判断；必须输出所选候选对应的引用标记。不得改答全书概览，不得引用候选之外的篇名；证据不足时要明确说“最可能是”，不能编造。`
    : describedStoryMatch
      ? `任务类型：用户正在核验指定作品内的情节或事实。检索已定位到${storyTitleLabel(describedStoryMatch)}。第一句直接回答“有”或“没有”，并点明篇名；随后只依据该篇原文解释，另起一行输出 [[cite:${describedStoryMatch.passageId}]]。正文不要用引号自行声称逐字原文，服务器会插入精确原文；不得分析无关篇目，不得说当前片段没有命中。`
    : namedSource
      ? `任务类型：指定篇目解释。用户明确在问《${namedSource.passageTitle}》，必须紧扣问题中的“为什么 / 如何 / 什么”等动作，从该篇的具体场景解释；标题和正文都应点明《${namedSource.passageTitle}》，不得退回全书概览或书名释义。`
      : '任务类型：开放问答。先判断用户是在求解释、概览、比较、推荐、事实还是续问，然后完成该任务；不得因为识别到书名就擅自改答“书名是什么意思”。若用户要求多个对象，应覆盖相应数量。'

  const requestBody = JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: `你是${askAgentProfile.name}，${askAgentProfile.productName}里的${askAgentProfile.role}。先识别用户这一次真正要求你完成的任务，再回答；不得用与问题无关的通用模板替代任务，也不要偷换问题中的关键宾语、比较对象或数量。你的性格温和、好奇、诚实，表达清楚而有画面，但不故作玄妙。解释型问题前两句要直接回应核心矛盾；推荐型问题直接给出多个具体选择和差异。随后从证据中选择具体场景、措辞次序或叙事动作，先说明原文发生了什么，再解释它为何相关。不要用抽象名词代替文本细节。你不能自称真实僧人、师父或权威，不能夸赞用户提问，不能用反问邀互动、生活鸡汤或效果承诺收尾。系统提供的是检索候选，不等于全部都能支持答案；只使用真正相关的候选。只要提供了站内候选，回答必须为每条实际采用的证据另起一行输出 [[cite:段落ID]]；未引用的候选不会显示给用户。若所有候选都不能直接支持答案，必须明确说明“提供的原文不足以支持这一判断”，并另起一行输出 [[no_evidence]]，不得硬凑出处。事实断言必须严格依据实际引用的片段；回答正文不要自行抄录原文，也不要输出 block quote、引用编号或证据章节，服务器会校验标记并替换为真实短引文。不得改写或编造段落 ID。若没有站内原文，可以使用稳定的通识知识回答，但必须明确说明本轮没有站内原文；不能使用引号假装复述经典，绝不能编造引文或出处。不要用“请向师父、僧人或善知识请益”作套话。最近对话只用于理解追问，不是证据。遇到不确定事实时说明不确定，不要用拒答代替解释。`,
        },
        {
          role: 'user',
          content: `最近对话：\n${historyText}\n\n当前问题：${question}\n\n${taskInstruction}\n\n站内原文候选：\n${sourceText}\n\n请用中文 Markdown 回答。解释型问题前两句直接给出判断，通常控制在 260 到 440 个汉字、3 到 4 个短段落；推荐或比较型问题可以按对象分成 3 个三级标题，总长度不超过 700 个汉字。段落之间空一行，不要输出 HTML。回答必须与当前问题的动作和数量一致，不要套用书名释义、作品概览或固定开场。提供候选时只引用真正支持答案的段落；没有候选时先给出有用的通识回答，再明确说明没有站内原文。不要以夸赞用户、生活建议或追问用户感受作结。`,
        },
      ],
    })
  const deadline = Date.now() + modelTimeoutMs
  let lastError = '模型服务暂不可用'

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return { error: '模型请求超时' }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), remainingMs)
    try {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: modelRequestHeaders(config.apiKey),
        signal: controller.signal,
        body: requestBody,
      })
      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const answer = data.choices?.[0]?.message?.content?.trim()
        if (answer) return { answer }
        lastError = '模型响应为空'
      } else {
        lastError = await modelHttpError(response)
        if (!transientModelStatuses.has(response.status)) return { error: lastError }
      }
    } catch (error) {
      lastError = modelErrorMessage(error)
      if (error instanceof Error && error.name === 'AbortError') return { error: lastError }
    } finally {
      clearTimeout(timeout)
    }
    if (attempt === 0 && deadline - Date.now() > 800) {
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
  }
  return { error: lastError }
}

function modelErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '模型请求超时'
    return error.message.slice(0, 120)
  }
  return '模型请求失败'
}

async function modelHttpError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: unknown } } | null
  const message = typeof payload?.error?.message === 'string'
    ? payload.error.message.replace(/\s+/g, ' ').trim().slice(0, 160)
    : ''
  console.warn(`[ask-agent] model gateway returned HTTP ${response.status}${message ? `: ${message}` : ''}`)
  return response.status === 401 || response.status === 403 ? '模型服务鉴权失败' : '模型服务暂不可用'
}
