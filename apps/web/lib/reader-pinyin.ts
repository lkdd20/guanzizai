const hanCharacterPattern = /\p{Script=Han}/u
const pinyinUnitPattern = /\p{Script=Latin}+|\p{Script=Han}/gu

/**
 * Convert the dataset's full-pinyin string into one entry per Han character.
 * Unknown extension characters are preserved by the dataset as Han glyphs;
 * expose those as null so the reader can mark the pronunciation as pending
 * instead of shifting every annotation that follows it.
 */
export function pinyinUnits(value: string | undefined) {
  if (!value) return []
  return (value.match(pinyinUnitPattern) ?? []).map((unit) => (
    hanCharacterPattern.test(unit) ? null : unit
  ))
}

export function countHanCharacters(value: string) {
  return Array.from(value).filter((character) => hanCharacterPattern.test(character)).length
}

export function isHanCharacter(value: string) {
  return hanCharacterPattern.test(value)
}
