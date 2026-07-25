import { createRequire } from 'node:module'

const ISSUE_WEIGHTS = { high: 8, medium: 3, low: 1 }
const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const openccModule = await import(webRequire.resolve('opencc-js'))
const { Converter } = openccModule.default ?? openccModule
const toSimplified = Converter({ from: 'tw', to: 'cn' })

const EXPLANATORY_CONCEPTS = [
  { pattern: /无自性|沒有自性|没有自性/u, source: /無自性|无自性|自性/u, label: '无自性' },
  { pattern: /固定(?:的)?(?:自性|实体)|獨立不變|独立不变/u, source: /固定|自性|實體|实体|獨立|独立/u, label: '固定实体/自性' },
  { pattern: /因緣所生|因缘所生|緣起|缘起/u, source: /因緣|因缘|緣起|缘起/u, label: '因缘/缘起' },
  { pattern: /能證|能证|所證|所证/u, source: /能證|能证|所證|所证/u, label: '能证/所证' },
  { pattern: /實相|实相/u, source: /實相|实相/u, label: '实相' },
  { pattern: /輪迴|轮回/u, source: /輪迴|轮回/u, label: '轮回' },
]

const SOURCE_CAUSAL = /故|由是|因(?:此|是|緣|缘)|緣故|缘故/u
const TRANSLATION_CAUSAL = /因此|所以|因而|由此|从而|故而/u
const SOURCE_DIALOGUE = /(?:告|問|问|答|白|謂|谓).{0,10}(?:曰|言|[：:])|(?:曰|言)[：:，,]/u
const TRANSLATION_DIALOGUE = /说|說|问|問|答|告诉|告訴|道[：:，,]/u
const SOURCE_RELATION = /為.{0,12}所|为.{0,12}所|使|令|遣|與|与/u
const TRANSLATION_RELATION = /被|受到|使|让|讓|令|派|与|與/u
const MODEL_META = /作为(?:一个)?AI|以下是(?:白话)?翻译|无法翻译|希望能帮到|仅供参考|这段用现代汉语直述为/u
const MECHANICAL_REWRITE_ARTIFACTS = [
  /这段用现代汉语直述为/u,
  /在是至/u,
  /因这(?:[，。；：]|说|言|疑|故)/u,
  /何所以/u,
]
const MANTRA_MARKER = /咒曰|真言曰|陀羅尼|陀罗尼|莎婆訶|薩婆訶|萨婆诃|唵[。．s]/u
const MANTRA_INTERPRETATION = /意(?:为|為)|意思是|去吧|到彼岸|成就觉悟|覺悟圓成|觉悟圆成/u

function characters(value) {
  return [...String(value ?? '')]
}

function normalize(value) {
  return toSimplified(String(value ?? ''))
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function countMatches(value, expression) {
  return [...String(value ?? '').matchAll(expression)].length
}

function clauses(value) {
  return String(value ?? '').split(/[。！？；!?;\n]+/u).map((item) => item.trim()).filter(Boolean)
}

function numericTokens(value) {
  const content = toSimplified(String(value ?? ''))
  const result = new Set(content.match(/\d+/gu) ?? [])
  const expression = /[零〇一二三四五六七八九十百千万亿两]+/gu
  const singleNumeralUnits = /[人事法种種世劫年月日时時岁歲卷品章则則根界蕴蘊谛諦方国國土众眾重层層]/u
  for (const match of content.matchAll(expression)) {
    const token = canonicalNumericToken(match[0])
    const start = match.index ?? 0
    const previous = content[start - 1] ?? ''
    const next = content[start + match[0].length] ?? ''
    if (token.length > 1 || /[十百千万亿]/u.test(token) || previous === '第' || singleNumeralUnits.test(next)) {
      result.add(token)
    }
  }
  return result
}

function allNumericTokens(value) {
  const content = toSimplified(String(value ?? ''))
  return new Set((content.match(/\d+|[零〇一二三四五六七八九十百千万亿两]+/gu) ?? []).map(canonicalNumericToken))
}

function canonicalNumericToken(value) {
  return String(value).replace(/两/gu, '二').replace(/^一(?=[十百千万亿])/u, '')
}

function ngramRetention(source, translation, size = 4) {
  const sourceText = normalize(source)
  const targetText = normalize(translation)
  if (sourceText.length < 80 || targetText.length < 80) return 0
  const sourceNgrams = new Set()
  for (let index = 0; index <= sourceText.length - size; index += 1) sourceNgrams.add(sourceText.slice(index, index + size))
  let retained = 0
  let total = 0
  for (let index = 0; index <= targetText.length - size; index += 1) {
    retained += sourceNgrams.has(targetText.slice(index, index + size)) ? 1 : 0
    total += 1
  }
  return total ? retained / total : 0
}

function retentionRatio(source, translation) {
  const sourceChars = characters(normalize(source))
  if (!sourceChars.length) return 1
  const translationSet = new Set(characters(normalize(translation)))
  return sourceChars.filter((character) => translationSet.has(character)).length / sourceChars.length
}

function excerpt(value, maxLength = 180) {
  const content = characters(String(value ?? '').trim())
  return content.length > maxLength ? `${content.slice(0, maxLength).join('')}…` : content.join('')
}

function addIssue(issues, code, severity, message, evidence) {
  issues.push({ code, severity, message, ...(evidence ? { evidence } : {}) })
}

export function auditBuddhistTranslation({ original, translation, terms = [] }) {
  const issues = []
  const source = String(original ?? '').trim()
  const target = String(translation ?? '').trim()
  const lengthRatio = characters(target).length / Math.max(1, characters(source).length)

  if (!target) addIssue(issues, 'empty_translation', 'high', '译文为空。')
  if (target && lengthRatio < 0.45) addIssue(issues, 'possible_omission', 'high', '译文明显短于原文，可能存在漏译。', `长度比 ${lengthRatio.toFixed(3)}`)
  if (lengthRatio > 3.5) addIssue(issues, 'possible_expansion', 'medium', '译文明显长于原文，可能混入解释或发挥。', `长度比 ${lengthRatio.toFixed(3)}`)
  if (target && normalize(source) === normalize(target) && characters(source).length >= 10) {
    addIssue(issues, 'unchanged_source', 'high', '译文与原文基本相同，可能没有完成白话转换。')
  }
  if (MODEL_META.test(target)) addIssue(issues, 'model_meta_text', 'high', '译文包含模型说明或回答套话。')
  const artifact = MECHANICAL_REWRITE_ARTIFACTS.find((expression) => expression.test(target))
  if (artifact) addIssue(issues, 'mechanical_rewrite_artifact', 'high', '译文包含机械替换或生成流程残留，不能作为可读白话。', target.match(artifact)?.[0])

  const copyRatio = ngramRetention(source, target)
  if (copyRatio >= 0.82 && lengthRatio >= 0.72 && lengthRatio <= 1.4) {
    addIssue(issues, 'source_copy_rewrite', 'high', '长段译文与简体化原文高度相似，可能只做了简繁转换或少量机械替换。', `四字片段保留率 ${copyRatio.toFixed(3)}`)
  }

  for (const concept of EXPLANATORY_CONCEPTS) {
    if (concept.pattern.test(target) && !concept.source.test(source)) {
      addIssue(issues, 'added_interpretive_concept', 'high', `译文加入原文未直接表达的“${concept.label}”概念。`, concept.label)
    }
  }

  const sourceNegations = countMatches(source, /[無无不非未莫勿弗]/gu)
  const targetNegations = countMatches(target, /(?:没有|沒有|并非|並非|不可|不能|未曾|不|非|未|莫|勿|弗|无|無)/gu)
  if (sourceNegations > 0 && targetNegations === 0) {
    addIssue(issues, 'negation_missing', 'high', '原文含否定关系，译文未检测到对应否定。', `原文否定 ${sourceNegations}，译文否定 ${targetNegations}`)
  } else if (sourceNegations >= 3 && targetNegations < Math.ceil(sourceNegations * 0.45)) {
    addIssue(issues, 'negation_count_mismatch', 'medium', '原文与译文的否定关系数量差异较大，需要核对是否合并或漏译。', `原文否定 ${sourceNegations}，译文否定 ${targetNegations}`)
  }

  if (TRANSLATION_CAUSAL.test(target) && !SOURCE_CAUSAL.test(source)) {
    addIssue(issues, 'added_causal_relation', 'medium', '译文出现原文未明示的因果连接词，需要核对关系是否被强化。')
  }

  const sourceNumbers = numericTokens(source)
  const targetNumbers = allNumericTokens(target)
  for (const token of sourceNumbers) {
    if (!targetNumbers.has(token)) addIssue(issues, 'number_not_preserved', 'high', `原文数量“${token}”未在译文中保留。`, token)
  }

  const sourceClauses = clauses(source).length
  const targetClauses = clauses(target).length
  if (sourceClauses >= 4 && targetClauses < Math.ceil(sourceClauses * 0.5)) {
    addIssue(issues, 'clause_coverage_review', 'medium', '译文分句数量远少于原文，需要核对是否合并过度或遗漏。', `原文 ${sourceClauses} 句，译文 ${targetClauses} 句`)
  }

  if (SOURCE_DIALOGUE.test(source) && !TRANSLATION_DIALOGUE.test(target)) {
    addIssue(issues, 'dialogue_relation_review', 'medium', '原文存在问答或说话关系，译文未检测到对应表达，需核对说话主体。')
  }
  if (SOURCE_RELATION.test(source) && !TRANSLATION_RELATION.test(target)) {
    addIssue(issues, 'argument_structure_review', 'low', '原文含使令、被动或参与关系，译文需要复核主客体关系。')
  }

  if (MANTRA_MARKER.test(source)) {
    const ratio = retentionRatio(source, target)
    if (MANTRA_INTERPRETATION.test(target)) {
      addIssue(issues, 'mantra_forced_interpretation', 'high', '咒语或音译段被直接意译；应保留原文，把不确定解释移入注释。')
    }
    if (ratio < 0.45) {
      addIssue(issues, 'mantra_text_not_preserved', 'high', '咒语或音译文字在译文中的保留率过低。', `字符保留率 ${ratio.toFixed(3)}`)
    }
  }

  for (const term of terms) {
    const traditional = String(term.termTraditional ?? term.term_traditional ?? '').trim()
    const simplified = String(term.termSimplified ?? term.term_simplified ?? '').trim()
    const candidates = [...new Set([traditional, simplified].filter((item) => characters(item).length >= 2))]
    if (!candidates.some((candidate) => source.includes(candidate))) continue
    if (!candidates.some((candidate) => target.includes(candidate))) {
      addIssue(issues, 'term_rendering_review', 'low', `术语“${simplified || traditional}”未原样保留，需要按本作品术语策略核对译法。`, simplified || traditional)
    }
  }

  const score = issues.reduce((sum, issue) => sum + ISSUE_WEIGHTS[issue.severity], 0)
  const riskLevel = issues.some((issue) => issue.severity === 'high') || score >= 12
    ? 'high'
    : issues.some((issue) => issue.severity === 'medium') || score >= 3 ? 'medium' : issues.length ? 'low' : 'clear'
  return {
    riskLevel,
    score,
    lengthRatio: Number(lengthRatio.toFixed(3)),
    issues,
    sourceExcerpt: excerpt(source),
    translationExcerpt: excerpt(target),
  }
}

export function summarizeBuddhistTranslationAudits(rows) {
  const byWork = new Map()
  const issueCounts = new Map()
  const riskCounts = { clear: 0, low: 0, medium: 0, high: 0 }
  const passages = rows.map((row) => {
    const audit = auditBuddhistTranslation(row)
    riskCounts[audit.riskLevel] += 1
    const workId = String(row.workId ?? row.work_id)
    const work = byWork.get(workId) ?? {
      workId,
      title: String(row.workTitle ?? row.work_title ?? workId),
      passages: 0,
      clear: 0,
      low: 0,
      medium: 0,
      high: 0,
    }
    work.passages += 1
    work[audit.riskLevel] += 1
    byWork.set(workId, work)
    for (const issue of audit.issues) issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1)
    return {
      workId,
      workTitle: work.title,
      passageId: String(row.passageId ?? row.passage_id),
      sequence: Number(row.sequence),
      ...audit,
    }
  })

  passages.sort((left, right) => right.score - left.score || left.workId.localeCompare(right.workId) || left.sequence - right.sequence)
  return {
    totals: { passages: passages.length, riskCounts },
    works: [...byWork.values()].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    issueCounts: [...issueCounts.entries()].map(([code, count]) => ({ code, count })).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
    passages,
  }
}
