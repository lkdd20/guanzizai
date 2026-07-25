export type HighlightColor = 'cinnabar' | 'gold' | 'ink'

export interface AccountProfileSettings {
  slug: string
  bio: string
  publicEnabled: boolean
  showBio: boolean
  showContributions: boolean
  showReadingMilestones: boolean
}

export interface AccountBookmark {
  id: string
  workId: string
  workTitle: string
  passageId: string
  passageAnchor: string
  sequence: number
  excerpt: string
  createdAt: string
}

export interface AccountHighlight extends AccountBookmark {
  contentVersion: string
  selectedText: string
  contextBefore: string
  contextAfter: string
  startOffset: number
  endOffset: number
  color: HighlightColor
}

export function isAccountId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function normalizeProfileSlug(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').slice(0, 32)
    : ''
}

export function validProfileSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,31}$/.test(value) && !['admin', 'api', 'ask', 'login', 'read', 'register', 'support', 'sutras'].includes(value)
}

export function readingProgressRatio(sequence: number, totalPassages: number, intraPassageRatio = 0) {
  if (!Number.isFinite(sequence) || !Number.isFinite(totalPassages) || totalPassages <= 0) return 0
  return Math.min(1, Math.max(0, (Math.max(1, sequence) - 1 + Math.min(1, Math.max(0, intraPassageRatio))) / totalPassages))
}

export function cleanSelectedText(value: unknown, max = 1200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}
