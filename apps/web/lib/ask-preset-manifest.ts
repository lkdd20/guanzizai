// Preset answers are content data and are intentionally not distributed.
export const askPresetIdsByQuestion = {} as const

export type AskPresetId = never

export function askPresetIdForQuestion(_question: string): AskPresetId | undefined {
  return undefined
}
