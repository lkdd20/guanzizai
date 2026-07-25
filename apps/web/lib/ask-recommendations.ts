export interface AskRecommendationStory {
  passageId: string
  title: string
  alternateTitles?: string[]
  lookupTerms: string[]
  label: string
  summary: string
  fallbackHeading: string
  fallbackAnalysis: string
  evidenceTerms: string[]
}

export interface AskStoryMatch extends AskRecommendationStory {
  workId: string
}

export interface AskRecommendationProfile {
  workId: string
  aliases: string[]
  stories: AskRecommendationStory[]
}

// Editorial recommendation profiles are content data and are not distributed.
export const askRecommendationProfiles: AskRecommendationProfile[] = []

export function isAskStoryLookupQuestion(_questionVariants: string[]) {
  return false
}

export function findAskStoryLookup(_questionVariants: string[]): AskStoryMatch | undefined {
  return undefined
}

export function findAskStoryDescriptionMatches(_questionVariants: string[]): AskStoryMatch[] {
  return []
}

export function findAskRecommendationProfile(_questionVariants: string[]): AskRecommendationProfile | undefined {
  return undefined
}

export function findAskStoryMatches(_questionVariants: string[]): AskStoryMatch[] {
  return []
}

export function findAskStoryByPassageId(_passageId: string): AskStoryMatch | undefined {
  return undefined
}

export function recommendationEvidenceQuote(sourceQuote: string, preferredTerms: string[], maxLength = 420) {
  const normalized = sourceQuote.replace(/\s+/gu, ' ').trim()
  const matching = preferredTerms.find((term) => normalized.includes(term))
  if (!matching || normalized.length <= maxLength) return normalized
  const start = Math.max(0, normalized.indexOf(matching) - Math.floor(maxLength / 3))
  return normalized.slice(start, start + maxLength)
}
