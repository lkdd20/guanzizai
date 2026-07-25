import { describe, expect, it } from 'vitest'

import {
  findReadingProgress,
  parseReadingProgress,
  type ReadingProgressRecord,
  upsertReadingProgress,
} from '../apps/web/lib/reading-progress'

function progress(overrides: Partial<ReadingProgressRecord> = {}): ReadingProgressRecord {
  return {
    workId: 'work-1',
    contentVersion: 'revision-a',
    passageId: 'passage-8',
    sequence: 8,
    readerMode: 'original',
    writingDirection: 'horizontal',
    intraPassageRatio: 0,
    deviceId: 'test-device',
    updatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  }
}

describe('guest reading progress', () => {
  it('rejects malformed stored records', () => {
    expect(parseReadingProgress('{broken')).toEqual([])
    expect(parseReadingProgress(JSON.stringify([{ workId: 'missing-fields' }]))).toEqual([])
  })

  it('upgrades progress written before vertical reading support', () => {
    const [record] = parseReadingProgress(JSON.stringify([{
      workId: 'work-1', contentVersion: 'revision-a', passageId: 'p-2', sequence: 2,
      readerMode: 'original', updatedAt: '2026-07-14T12:00:00.000Z',
    }]))

    expect(record.writingDirection).toBe('horizontal')
    expect(record.intraPassageRatio).toBe(0)
  })

  it('keeps the newest record for a work', () => {
    const updated = progress({ sequence: 19, passageId: 'passage-19' })
    const records = upsertReadingProgress([progress()], updated)

    expect(records).toHaveLength(1)
    expect(records[0].sequence).toBe(19)
  })

  it('does not restore progress from another content version', () => {
    const records = [progress()]

    expect(findReadingProgress(records, 'work-1', 'revision-b')).toBeNull()
    expect(findReadingProgress(records, 'work-1', 'revision-a')?.sequence).toBe(8)
  })

  it('limits local progress to the latest 100 works', () => {
    const records = Array.from({ length: 105 }, (_, index) => progress({
      workId: `work-${index}`,
      updatedAt: new Date(Date.UTC(2026, 6, 14, 0, index)).toISOString(),
    }))
    const result = upsertReadingProgress(records, progress({ workId: 'latest', updatedAt: '2026-07-15T00:00:00.000Z' }))

    expect(result).toHaveLength(100)
    expect(result[0].workId).toBe('latest')
  })
})
