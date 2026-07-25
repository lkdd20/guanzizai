import { describe, expect, it } from 'vitest'

import { deriveWorkStructure, sectionForPassage } from '../scripts/lib/work-structure.mjs'

function work(title: string, originals: string[]) {
  return {
    sutra: { title_zh: title },
    passages: originals.map((original, index) => ({
      seq: index + 1,
      original,
      char_count: Array.from(original).length,
    })),
  }
}

describe('generic work structure', () => {
  it('builds volume and chapter nodes without work-specific rules', () => {
    const structure = deriveWorkStructure(work('测试集', [
      '测试集',
      '卷一\n第一组',
      '第一篇',
      '正文第一段。',
      '第二篇',
      '正文第二段。',
      '卷二',
      '第三篇',
      '正文第三段。',
    ]))

    expect(structure.map(({ kind, title, level, sequence, endSequence }) => ({ kind, title, level, sequence, endSequence }))).toEqual([
      { kind: 'body', title: '正文', level: 1, sequence: 1, endSequence: 1 },
      { kind: 'volume', title: '卷一', level: 1, sequence: 2, endSequence: 6 },
      { kind: 'chapter', title: '第一篇', level: 2, sequence: 3, endSequence: 4 },
      { kind: 'chapter', title: '第二篇', level: 2, sequence: 5, endSequence: 6 },
      { kind: 'volume', title: '卷二', level: 1, sequence: 7, endSequence: 9 },
      { kind: 'chapter', title: '第三篇', level: 2, sequence: 8, endSequence: 9 },
    ])
    expect(sectionForPassage(structure, 6)?.title).toBe('第二篇')
  })

  it('falls back to a body node when the source has no trustworthy headings', () => {
    const structure = deriveWorkStructure(work('短文', ['这是第一段。', '这是第二段。']))
    expect(structure).toHaveLength(1)
    expect(structure[0]).toMatchObject({ kind: 'body', title: '正文', sequence: 1, endSequence: 2 })
  })
})
