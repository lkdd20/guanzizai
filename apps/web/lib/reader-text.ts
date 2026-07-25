const quotePairs: Record<string, string> = {
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
}

const closingQuotes = new Set(Object.values(quotePairs))

/** Remove display-only boundary artifacts while preserving source text in storage. */
export function cleanReaderText(value: string) {
  const stack: string[] = []
  let output = ''
  let lineStart = true
  for (const character of value) {
    if (character === '\n') {
      output += character
      lineStart = true
      continue
    }
    if (lineStart && /\s/u.test(character)) {
      output += character
      continue
    }
    if (character === ';' && (lineStart || ['「', '『', '“', '‘'].includes(output.at(-1) ?? ''))) continue

    const expectedClosing = quotePairs[character]
    if (expectedClosing) {
      stack.push(expectedClosing)
      output += character
      lineStart = false
      continue
    }
    if (closingQuotes.has(character)) {
      if (stack.at(-1) === character) {
        stack.pop()
        output += character
      } else if (!lineStart && (stack.length > 0 || output.at(-1) !== character)) {
        output += character
      }
      lineStart = false
      continue
    }
    output += character
    lineStart = false
  }
  return output
}
