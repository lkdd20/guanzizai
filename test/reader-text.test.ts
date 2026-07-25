import { describe, expect, it } from 'vitest'

import { cleanReaderText } from '../apps/web/lib/reader-text'

describe('reader text display cleanup', () => {
  it('removes an orphan closing quote at the beginning of a line', () => {
    expect(cleanReaderText('」段首不应从闭引号开始。')).toBe('段首不应从闭引号开始。')
    expect(cleanReaderText('第一行\n”第二行')).toBe('第一行\n第二行')
  })

  it('preserves balanced and nested quotes', () => {
    expect(cleanReaderText('他说：「先内引『一句话』，再结束。」')).toBe('他说：「先内引『一句话』，再结束。」')
    expect(cleanReaderText('「跨行\n引号仍然有效」')).toBe('「跨行\n引号仍然有效」')
  })

  it('removes an extra repeated closing quote but keeps ordinary punctuation', () => {
    expect(cleanReaderText('他说：「好。」」后来又解释。')).toBe('他说：「好。」后来又解释。')
    expect(cleanReaderText('他说：「好。」后来又解释。')).toBe('他说：「好。」后来又解释。')
  })
})
