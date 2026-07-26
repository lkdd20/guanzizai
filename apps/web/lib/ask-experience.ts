import { sampleWork, termDefinitions } from './content'
import { askPresetIdForQuestion, type AskPresetId } from './ask-preset-manifest'

export interface AskCatalogResource {
  id: string
  title: string
  shortTitle: string
  href: string
  library: '国学'
  keywords: string[]
}

export interface AskExperience {
  resources: AskCatalogResource[]
  suggestedQuestionBatches: AskSuggestedQuestion[][]
}

export interface AskSuggestedQuestion {
  id: string
  question: string
  presetId?: AskPresetId
}

export interface AskDatabaseResource {
  id: string
  title: string
  library: string
  keywords: string[]
}

const sampleResource: AskCatalogResource = {
  id: sampleWork.id,
  title: sampleWork.title,
  shortTitle: sampleWork.shortTitle,
  href: `/read/${sampleWork.id}`,
  library: sampleWork.library,
  keywords: termDefinitions.map((term) => term.term),
}

const sampleQuestions = [
  '这段原文和辅助释文分别表达了什么？',
  '回答中的结论可以回到哪一段原文核验？',
  '如果资料不足，系统应当怎样说明依据边界？',
]

export function buildAskExperience(databaseResources: AskDatabaseResource[] = []): AskExperience {
  const resources = new Map<string, AskCatalogResource>([[sampleResource.id, sampleResource]])
  for (const resource of databaseResources) {
    if (!resource.id || !resource.title) continue
    resources.set(resource.id, {
      id: resource.id,
      title: resource.title,
      shortTitle: resource.title,
      href: `/read/${encodeURIComponent(resource.id)}`,
      library: '国学',
      keywords: [...new Set(resource.keywords)].slice(0, 4),
    })
  }

  return {
    resources: Array.from(resources.values()),
    suggestedQuestionBatches: [
      sampleQuestions.map((question) => ({
        id: stableQuestionId(question),
        question,
        presetId: askPresetIdForQuestion(question),
      })),
    ],
  }
}

function stableQuestionId(question: string) {
  let hash = 2166136261
  for (const character of question) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `question-${(hash >>> 0).toString(36)}`
}

export const defaultAskExperience = buildAskExperience()
