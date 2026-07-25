import { describe, expect, it } from 'vitest'

import { centeredOutlineScrollTop, currentOutlineItemKey, passagePageCacheKey } from '../apps/web/lib/reader-pagination'

describe('reader passage pagination', () => {
  it('isolates cached pages by content version', () => {
    const previous = passagePageCacheKey('work-1', 'revision-a', 31)
    const current = passagePageCacheKey('work-1', 'revision-b', 31)

    expect(previous).not.toBe(current)
    expect(current).toBe('work-1:revision-b:passages-v3:31')
  })

  it('locates a linked passage inside its containing directory range', () => {
    const outline = [
      { key: 'volume-1', sequence: 1, endSequence: 20 },
      { key: 'volume-2', sequence: 21, endSequence: 40 },
    ]

    expect(currentOutlineItemKey(outline, 15)).toBe('volume-1')
    expect(currentOutlineItemKey(outline, 21)).toBe('volume-2')
    expect(currentOutlineItemKey(outline, 41)).toBe('')
  })

  it('centers the current directory item using viewport-relative positions', () => {
    expect(centeredOutlineScrollTop({
      containerHeight: 374,
      containerScrollTop: 735,
      containerTop: 222,
      itemHeight: 47,
      itemTop: 164,
    })).toBe(513.5)

    expect(centeredOutlineScrollTop({
      containerHeight: 374,
      containerScrollTop: 0,
      containerTop: 222,
      itemHeight: 47,
      itemTop: 230,
    })).toBe(0)
  })
})
