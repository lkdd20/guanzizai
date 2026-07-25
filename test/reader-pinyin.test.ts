import { describe, expect, it } from 'vitest'

import { countHanCharacters, isHanCharacter, pinyinUnits } from '../apps/web/lib/reader-pinyin'

describe('reader pinyin alignment', () => {
  it('extracts one pronunciation unit per Han character', () => {
    const text = '予姊夫之祖，宋公讳焘。'
    const pinyin = 'yǔ zǐ fū zhī zǔ， sòng gōng huì dào。'

    expect(pinyinUnits(pinyin)).toEqual(['yǔ', 'zǐ', 'fū', 'zhī', 'zǔ', 'sòng', 'gōng', 'huì', 'dào'])
    expect(pinyinUnits(pinyin)).toHaveLength(countHanCharacters(text))
  })

  it('keeps an unknown extension glyph as an empty aligned unit', () => {
    const text = '公镂膺朱𪩸，舆马甚众。'
    const pinyin = 'gōng lòu yīng zhū 𪩸， yú mǎ shèn zhòng。'

    expect(pinyinUnits(pinyin)).toEqual(['gōng', 'lòu', 'yīng', 'zhū', null, 'yú', 'mǎ', 'shèn', 'zhòng'])
    expect(pinyinUnits(pinyin)).toHaveLength(countHanCharacters(text))
  })

  it('recognizes common and extension Han characters', () => {
    expect(isHanCharacter('心')).toBe(true)
    expect(isHanCharacter('𪩸')).toBe(true)
    expect(isHanCharacter('，')).toBe(false)
  })
})
