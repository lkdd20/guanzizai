export type StoredReaderMode = 'original' | 'plain' | 'parallel'

export interface ReadingProgressRecord {
  workId: string
  contentVersion: string
  passageId: string
  sequence: number
  readerMode: StoredReaderMode
  writingDirection: 'horizontal' | 'vertical'
  intraPassageRatio: number
  deviceId: string
  totalPassages?: number
  progressRatio?: number
  updatedAt: string
}

const maxProgressRecords = 100
export const readingProgressStorageKey = 'guanzizai:reading-progress:v1'

function isReaderMode(value: unknown): value is StoredReaderMode {
  return value === 'original' || value === 'plain' || value === 'parallel'
}

export function parseReadingProgress(value: string | null): ReadingProgressRecord[] {
  if (!value) return []
  try {
    const records = JSON.parse(value) as unknown
    if (!Array.isArray(records)) return []
    return records.flatMap((record): ReadingProgressRecord[] => {
      if (!record || typeof record !== 'object') return []
      const candidate = record as Partial<ReadingProgressRecord>
      const valid = typeof candidate.workId === 'string'
        && typeof candidate.contentVersion === 'string'
        && typeof candidate.passageId === 'string'
        && typeof candidate.sequence === 'number'
        && Number.isFinite(candidate.sequence)
        && candidate.sequence > 0
        && isReaderMode(candidate.readerMode)
        && typeof candidate.updatedAt === 'string'
      if (!valid) return []
      return [{
        workId: candidate.workId!,
        contentVersion: candidate.contentVersion!,
        passageId: candidate.passageId!,
        sequence: candidate.sequence!,
        readerMode: candidate.readerMode!,
        writingDirection: candidate.writingDirection === 'vertical' ? 'vertical' : 'horizontal',
        intraPassageRatio: typeof candidate.intraPassageRatio === 'number'
          ? Math.min(1, Math.max(0, candidate.intraPassageRatio))
          : 0,
        deviceId: typeof candidate.deviceId === 'string' ? candidate.deviceId : '',
        totalPassages: typeof candidate.totalPassages === 'number' && candidate.totalPassages > 0 ? candidate.totalPassages : undefined,
        progressRatio: typeof candidate.progressRatio === 'number' ? Math.min(1, Math.max(0, candidate.progressRatio)) : undefined,
        updatedAt: candidate.updatedAt!,
      }]
    })
  } catch {
    return []
  }
}

export function upsertReadingProgress(
  records: ReadingProgressRecord[],
  progress: ReadingProgressRecord,
) {
  return [progress, ...records.filter((record) => record.workId !== progress.workId)]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, maxProgressRecords)
}

export function findReadingProgress(
  records: ReadingProgressRecord[],
  workId: string,
  contentVersion: string,
) {
  return records.find((record) => (
    record.workId === workId && record.contentVersion === contentVersion
  )) ?? null
}
