export interface SourceReadingNote {
  note_id?: string
  term_traditional?: string
  term_simplified?: string
  pinyin?: string
  sanskrit_or_other_form?: string
  explanation?: string
  category?: string
  status?: string
  confidence?: string
  propagation?: 'source_binding' | 'exact_match'
}

export interface TermIndexPassage {
  id: string
  originalText?: string
  original?: string
  readingNotes?: SourceReadingNote[]
}

export function canonicalTermKey(note: SourceReadingNote): string

export function buildWorkTermIndex(input: {
  notes: SourceReadingNote[]
  passages: TermIndexPassage[]
  passageTermLimit?: number
}): {
  definitions: Array<Record<string, any>>
  mentions: Array<Record<string, any>>
  notesByPassage: Map<string, SourceReadingNote[]>
  metrics: {
    sourceNotes: number
    definitions: number
    duplicateSourceNotes: number
    mentions: number
    displayableMentions: number
    coveredPassages: number
    orphanDefinitions: number
  }
}
