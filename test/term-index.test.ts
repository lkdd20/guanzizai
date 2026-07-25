import { describe, expect, it } from 'vitest'

import { buildWorkTermIndex, canonicalTermKey } from '../scripts/lib/term-index.mjs'

function note(term: string, explanation: string, id: string) {
  return {
    note_id: id,
    term_traditional: term,
    term_simplified: term,
    pinyin: '',
    explanation,
    category: '阅读术语',
    status: 'machine_draft',
    confidence: 'medium',
  }
}

describe('term index', () => {
  it('deduplicates definitions and propagates exact matches to other passages', () => {
    const sourceNote = note('版本记录', '用于标识文本所依据的版本。', 'note-1')
    const duplicate = { ...sourceNote, note_id: 'note-2' }
    const result = buildWorkTermIndex({
      notes: [sourceNote, duplicate],
      passages: [
        { id: 'p1', originalText: '阅读前先检查版本记录。', readingNotes: [sourceNote] },
        { id: 'p2', originalText: '发布时应保留版本记录。', readingNotes: [] },
      ],
    })

    expect(canonicalTermKey(sourceNote)).toBe('版本记录')
    expect(result.definitions).toHaveLength(1)
    expect(result.definitions[0].sourceNoteCount).toBe(2)
    expect(result.metrics.duplicateSourceNotes).toBe(1)
    expect(result.metrics.coveredPassages).toBe(2)
    expect(result.notesByPassage.get('p2')?.[0].propagation).toBe('exact_match')
  })

  it('keeps generic source bindings but does not propagate them through every passage', () => {
    const generic = note('文', '泛指文本。', 'note-generic')
    const result = buildWorkTermIndex({
      notes: [generic],
      passages: [
        { id: 'p1', originalText: '先读其文。', readingNotes: [generic] },
        { id: 'p2', originalText: '再核其文。', readingNotes: [] },
      ],
    })

    expect(result.notesByPassage.has('p1')).toBe(true)
    expect(result.notesByPassage.has('p2')).toBe(false)
    expect(result.mentions.find((mention) => mention.passageId === 'p2')?.displayable).toBe(false)
  })

  it('prefers the longest non-overlapping term and highlights one definition per passage', () => {
    const short = note('版本', '文本版本。', 'note-short')
    const long = note('版本记录', '文本的版本记录。', 'note-long')
    const result = buildWorkTermIndex({
      notes: [short, long],
      passages: [{ id: 'p1', originalText: '发布时应保留版本记录。', readingNotes: [long] }],
    })

    const visible = result.mentions.filter((mention) => mention.displayable)
    expect(visible).toHaveLength(1)
    expect(visible[0].matchedText).toBe('版本记录')
    expect(result.notesByPassage.get('p1')).toHaveLength(1)
  })
})
