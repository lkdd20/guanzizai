import type { AskPresetId } from './ask-preset-manifest'

export interface AskPresetSourceSnapshot {
  workId: string
  sequence: number
  passageId: string
  fingerprint: string
}

export interface AskPresetDefinition {
  id: AskPresetId
  question: string
  answer: string
  sources: AskPresetSourceSnapshot[]
  answerVersion: string
  generatedAt: string
  generationModel: string
  reviewStatus: 'ai_generated_unreviewed'
}

// Generated answers and their source fingerprints are private content data.
export const askPresetDefinitions: Readonly<Record<string, AskPresetDefinition>> = {}

export function getAskPresetDefinition(id: string, question?: string): AskPresetDefinition | undefined {
  const definition = askPresetDefinitions[id]
  if (!definition) return undefined
  if (question !== undefined && definition.question !== question.trim()) return undefined
  return definition
}
