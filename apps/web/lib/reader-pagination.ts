export function passagePageCacheKey(workId: string, contentVersion: string, sequence: number) {
  return `${workId}:${contentVersion}:passages-v3:${sequence}`
}

interface OutlineRange {
  key: string
  sequence: number
  endSequence: number
}

export function currentOutlineItemKey(items: OutlineRange[], sequence: number) {
  return items.find((item) => sequence >= item.sequence && sequence <= item.endSequence)?.key ?? ''
}

interface OutlineScrollPosition {
  containerHeight: number
  containerScrollTop: number
  containerTop: number
  itemHeight: number
  itemTop: number
}

export function centeredOutlineScrollTop(position: OutlineScrollPosition) {
  const itemTopWithinContent = position.containerScrollTop + position.itemTop - position.containerTop
  return Math.max(0, itemTopWithinContent - (position.containerHeight - position.itemHeight) / 2)
}
