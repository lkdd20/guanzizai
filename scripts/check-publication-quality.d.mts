export interface WorkQualityReport {
  id: string
  title: string
  characters: number
  punctuationCount: number
  punctuationRatio: number
  suspiciousGlyphCount: number
  longPassageCount: number
  passageCount: number
  publishable: boolean
  reasons: string[]
}

export function analyzeWork(work: Record<string, any>): WorkQualityReport
