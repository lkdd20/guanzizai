import 'server-only'

import { createHash } from 'node:crypto'

import { askAgentProfile } from './ask-agent-profile'
import { addVerifiedInlineCitations } from './ask-answer-format'
import type { AskAgentResponse, AskAgentSource } from './ask-agent'
import { getAskPresetDefinition } from './ask-preset-data'
import { heartSutra } from './content'
import { getPublishedAskPresetPassages } from './content-db'

function fingerprint(value: string) {
  return createHash('sha256').update(value.replace(/\r\n?/gu, '\n').trim()).digest('hex')
}

function evidenceQuote(value: string) {
  const normalized = value.trim()
  return normalized.length > 420 ? `${normalized.slice(0, 420)}…` : normalized
}

export async function resolveAskPreset(id: string, question: string): Promise<AskAgentResponse | undefined> {
  const definition = getAskPresetDefinition(id, question)
  if (!definition) return undefined

  const heartSnapshots = definition.sources.filter((snapshot) => snapshot.workId === heartSutra.id)
  const databaseSnapshots = definition.sources.filter((snapshot) => snapshot.workId !== heartSutra.id)
  const databasePassages = databaseSnapshots.length
    ? await getPublishedAskPresetPassages(databaseSnapshots.map((snapshot) => snapshot.passageId))
    : []
  const databaseById = new Map(databasePassages.map((passage) => [passage.passageId, passage]))

  const sources: AskAgentSource[] = []
  for (const [index, snapshot] of definition.sources.entries()) {
    if (snapshot.workId === heartSutra.id) {
      const passage = heartSutra.passages.find((candidate) => candidate.anchorId === snapshot.passageId)
      if (!passage || passage.seq !== snapshot.sequence || fingerprint(passage.original) !== snapshot.fingerprint) return undefined
      sources.push({
        id: passage.anchorId,
        ref: passage.sourceRef,
        quote: passage.original,
        href: `/read/${heartSutra.id}#${passage.anchorId}`,
        confidence: Math.max(78, 96 - index * 4),
        verification: 'verified',
      })
      continue
    }

    const passage = databaseById.get(snapshot.passageId)
    if (!passage
      || passage.workId !== snapshot.workId
      || passage.sequence !== snapshot.sequence
      || fingerprint(passage.quote) !== snapshot.fingerprint) return undefined
    sources.push({
      id: passage.passageId,
      ref: `《${passage.workTitle}》 · 卷 ${passage.juan} · 段 ${String(passage.sequence).padStart(6, '0')}`,
      quote: evidenceQuote(passage.quote),
      href: `/read/${encodeURIComponent(passage.workId)}?start=${passage.sequence}#${encodeURIComponent(passage.passageId)}`,
      confidence: Math.max(78, 96 - index * 4),
      verification: passage.sourceVerification === 'verified' ? 'verified' : 'unverified',
    })
  }

  if (sources.length !== definition.sources.length || heartSnapshots.length + databaseSnapshots.length !== sources.length) return undefined

  return {
    answer: addVerifiedInlineCitations(definition.answer, sources, 2),
    sources,
    mode: 'preset',
    note: '本轮回答已按当前典藏原文校验；可从出处栏打开原文核对。',
    agent: {
      name: askAgentProfile.internalName,
      displayName: askAgentProfile.name,
      role: askAgentProfile.role,
      version: askAgentProfile.version,
      status: 'answerable',
      scope: 'catalog-preset',
      model: definition.generationModel,
    },
    trace: [
      { id: 'match_preset', label: '预设匹配', status: 'done', detail: `命中回答版本 ${definition.answerVersion}。` },
      { id: 'verify_sources', label: '原文校验', status: 'done', detail: `已核对 ${sources.length} 条已发布原文及内容指纹。` },
      { id: 'attach_sources', label: '出处绑定', status: 'done', detail: '已附阅读页锚点。' },
    ],
    preset: {
      id: definition.id,
      answerVersion: definition.answerVersion,
      generatedAt: definition.generatedAt,
      reviewStatus: definition.reviewStatus,
    },
  }
}
