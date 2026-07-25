import { cleanReaderText } from './reader-text'

export type VerticalCanvasLayout = 'compact' | 'balanced' | 'expansive'

const estimatedCharactersPerColumn = 22
const minimumFrameWidth = 360
const maximumFrameWidth = 1320
const minimumFrameHeight = 360
const maximumFrameHeight = 820

function readableCharacterCount(value: string) {
  return Array.from(cleanReaderText(value).replace(/\s+/gu, '')).length
}

export function verticalCanvasLayout(originalCharacterCount: number, paginated: boolean): VerticalCanvasLayout {
  if (paginated) return 'expansive'
  if (originalCharacterCount <= 800) return 'compact'
  if (originalCharacterCount <= 2200) return 'balanced'
  return 'expansive'
}

export function estimateVerticalFrameDimensions(text: string, fontSize: number, lineHeight: number) {
  const normalized = cleanReaderText(text)
  const characterCount = readableCharacterCount(normalized)
  const paragraphs = normalized.split(/\n+/u).filter((line) => line.trim())
  const paragraphCount = Math.max(1, paragraphs.length)
  const estimatedColumns = Math.max(
    1,
    Math.ceil(characterCount / estimatedCharactersPerColumn) + Math.min(3, paragraphCount - 1),
  )
  const columnPitch = fontSize * (lineHeight + 0.28)
  const inlinePadding = fontSize * 6.4
  const longestParagraphLength = Math.max(
    1,
    ...paragraphs.map((paragraph) => readableCharacterCount(paragraph)),
  )
  const columnCharacters = Math.min(estimatedCharactersPerColumn, longestParagraphLength)
  const blockPadding = fontSize * 5

  return {
    width: Math.round(Math.min(
      maximumFrameWidth,
      Math.max(minimumFrameWidth, estimatedColumns * columnPitch + inlinePadding),
    )),
    height: Math.round(Math.min(
      maximumFrameHeight,
      Math.max(minimumFrameHeight, columnCharacters * fontSize + blockPadding),
    )),
  }
}

export function groupContinuousVerticalItems<T>(
  items: T[],
  textFor: (item: T) => string,
  maxCharacters = 720,
  maxItems = 16,
  groupKeyFor: (item: T) => string | number = () => '',
) {
  const groups: T[][] = []
  let current: T[] = []
  let characterCount = 0
  let currentGroupKey: string | number | undefined

  for (const item of items) {
    const groupKey = groupKeyFor(item)
    const itemCharacterCount = readableCharacterCount(textFor(item))
    if (current.length && (groupKey !== currentGroupKey || current.length >= maxItems || characterCount + itemCharacterCount > maxCharacters)) {
      groups.push(current)
      current = []
      characterCount = 0
    }
    current.push(item)
    currentGroupKey = groupKey
    characterCount += itemCharacterCount
  }
  if (current.length) groups.push(current)
  return groups
}
