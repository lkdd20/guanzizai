import { describe, expect, it } from 'vitest'

import {
  estimateVerticalFrameDimensions,
  groupContinuousVerticalItems,
  verticalCanvasLayout,
} from '../apps/web/lib/reader-vertical-layout'

describe('vertical reader layout', () => {
  it('uses a compact canvas for short complete works', () => {
    expect(verticalCanvasLayout(260, false)).toBe('compact')
    expect(verticalCanvasLayout(1600, false)).toBe('balanced')
    expect(verticalCanvasLayout(5000, false)).toBe('expansive')
    expect(verticalCanvasLayout(260, true)).toBe('expansive')
  })

  it('grows a passage frame with its estimated column count', () => {
    const shortFrame = estimateVerticalFrameDimensions('先辨来源，再读其文。', 24, 2)
    const mediumFrame = estimateVerticalFrameDimensions('记录版本，标明出处，保留上下文。'.repeat(14), 24, 2)
    const longFrame = estimateVerticalFrameDimensions('古籍正文。'.repeat(500), 24, 2)

    expect(shortFrame).toEqual({ width: 360, height: 360 })
    expect(mediumFrame.width).toBeGreaterThan(shortFrame.width)
    expect(mediumFrame.height).toBeGreaterThan(shortFrame.height)
    expect(longFrame.width).toBe(1320)
    expect(longFrame.height).toBe(648)
  })

  it('packs short passages into continuous folios without changing order', () => {
    const passages = [
      { id: 'one', text: '天地玄黄。'.repeat(20) },
      { id: 'two', text: '宇宙洪荒。'.repeat(20) },
      { id: 'three', text: '日月盈昃。'.repeat(20) },
      { id: 'four', text: '辰宿列张。'.repeat(80) },
    ]

    const groups = groupContinuousVerticalItems(passages, (passage) => passage.text, 360, 16)

    expect(groups.map((group) => group.map((passage) => passage.id))).toEqual([
      ['one', 'two', 'three'],
      ['four'],
    ])
  })

  it('limits folios by passage count even when every passage is short', () => {
    const passages = Array.from({ length: 18 }, (_, index) => ({ id: index + 1, text: '一段。' }))
    const groups = groupContinuousVerticalItems(passages, (passage) => passage.text)

    expect(groups.map((group) => group.length)).toEqual([16, 2])
    expect(groups.flat().map((passage) => passage.id)).toEqual(passages.map((passage) => passage.id))
  })

  it('does not merge passages across volume boundaries', () => {
    const passages = [
      { id: 'juan-one', juan: 1, text: '甲乙丙。' },
      { id: 'juan-two', juan: 2, text: '丁戊己。' },
    ]
    const groups = groupContinuousVerticalItems(passages, (passage) => passage.text, 720, 16, (passage) => passage.juan)

    expect(groups.map((group) => group.map((passage) => passage.id))).toEqual([
      ['juan-one'],
      ['juan-two'],
    ])
  })

  it('lets a short final folio shrink instead of reserving a full-width canvas', () => {
    const passages = [
      { id: 'one', text: '天地玄黄。'.repeat(72) },
      { id: 'two', text: '宇宙洪荒。'.repeat(72) },
      { id: 'tail', text: '日月盈昃。'.repeat(4) },
    ]
    const groups = groupContinuousVerticalItems(passages, (passage) => passage.text, 720, 16)
    const frames = groups.map((group) => estimateVerticalFrameDimensions(
      group.map((passage) => passage.text).join('\n'),
      24,
      2,
    ))

    expect(groups.flat().map((passage) => passage.id)).toEqual(['one', 'two', 'tail'])
    expect(groups.at(-1)?.map((passage) => passage.id)).toEqual(['tail'])
    expect(frames.at(-1)?.width).toBeLessThan(frames[0].width)
  })
})
