export type BuddhistTranslationRiskLevel = 'clear' | 'low' | 'medium' | 'high'
export type BuddhistTranslationIssueSeverity = 'low' | 'medium' | 'high'

export interface BuddhistTranslationTerm {
  termTraditional?: string
  termSimplified?: string
  term_traditional?: string
  term_simplified?: string
}

export interface BuddhistTranslationAuditInput {
  original: string
  translation: string
  terms?: BuddhistTranslationTerm[]
  workId?: string
  work_id?: string
  workTitle?: string
  work_title?: string
  passageId?: string
  passage_id?: string
  sequence?: number
}

export interface BuddhistTranslationIssue {
  code: string
  severity: BuddhistTranslationIssueSeverity
  message: string
  evidence?: string
}

export interface BuddhistTranslationAudit {
  riskLevel: BuddhistTranslationRiskLevel
  score: number
  lengthRatio: number
  issues: BuddhistTranslationIssue[]
  sourceExcerpt: string
  translationExcerpt: string
}

export interface BuddhistTranslationPassageAudit extends BuddhistTranslationAudit {
  workId: string
  workTitle: string
  passageId: string
  sequence: number
}

export interface BuddhistTranslationWorkAudit {
  workId: string
  title: string
  passages: number
  clear: number
  low: number
  medium: number
  high: number
}

export function auditBuddhistTranslation(input: BuddhistTranslationAuditInput): BuddhistTranslationAudit

export function summarizeBuddhistTranslationAudits(rows: BuddhistTranslationAuditInput[]): {
  totals: {
    passages: number
    riskCounts: Record<BuddhistTranslationRiskLevel, number>
  }
  works: BuddhistTranslationWorkAudit[]
  issueCounts: Array<{ code: string; count: number }>
  passages: BuddhistTranslationPassageAudit[]
}
