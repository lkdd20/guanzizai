import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import { importWorks } from '../scripts/import-daizhige-postgres.mjs'

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function adapter(database: PGlite, passageInsertCounter = { value: 0 }) {
  interface TestDatabase {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
    transaction<T>(callback: (tx: TestDatabase) => Promise<T>): Promise<T>
  }
  const db: TestDatabase = {
    query: (text: string, params: unknown[] = []) => {
      if (/INSERT INTO passages/i.test(text)) passageInsertCounter.value += 1
      return database.query(text, params)
    },
    transaction: <T>(callback: (tx: TestDatabase) => Promise<T>) => database.transaction(async (tx) => {
      const transactionDb: TestDatabase = {
        query: (text: string, params: unknown[] = []) => {
          if (/INSERT INTO passages/i.test(text)) passageInsertCounter.value += 1
          return tx.query(text, params)
        },
        transaction: db.transaction,
      }
      return callback(transactionDb)
    }),
  }
  return db
}

function sample() {
  const originals = Array.from({ length: 513 }, (_, index) => `第${index + 1}段已经结构化、尚未核验的古籍文字。`)
  const passages = originals.map((original, index) => ({
    id: `dzg-test-work_j1_${String(index + 1).padStart(6, '0')}`,
    seq: index + 1,
    original,
    sha256: hash(original),
    char_count: Array.from(original).filter((character) => /[\p{Letter}\p{Number}]/u.test(character)).length,
  }))
  const workHash = hash(originals.join(''))
  const characterCount = passages.reduce((sum, passage) => sum + passage.char_count, 0)
  const work = {
    sutra: {
      id: 'dzg-test-work',
      library: '国学',
      source_batch: 'daizhige-test',
      source_verification: 'unverified',
      source_edition: '殆知阁 daizhigev20 · 子藏/笔记/测试作品.txt · 批量收录，未核验',
      title_zh: '测试作品',
      byline: null,
      dynasty: null,
      category: '笔记',
      char_count: characterCount,
      sha256: workHash,
      created_at: '2026-07-11T00:00:00.000Z',
    },
    passages,
  }
  return {
    manifest: {
      batch: 'daizhige-test',
      source: { repository: 'https://example.test/daizhige', commit: 'abc123' },
    },
    manifestHash: hash('manifest'),
    works: [work],
  }
}

describe('PostgreSQL batch import', () => {
  it('supports metadata-only imports without storing passage text', async () => {
    const database = new PGlite()
    await database.exec(readFileSync(join(process.cwd(), 'postgres', 'schema.sql'), 'utf8'))
    const passageInsertCounter = { value: 0 }
    const input = sample()

    await importWorks(adapter(database, passageInsertCounter), input, { metadataOnly: true })
    await importWorks(adapter(database, passageInsertCounter), input, { metadataOnly: true })

    expect(passageInsertCounter.value).toBe(0)
    const counts = await database.query<{ works: number; sections: number; passages: number; passage_count: number; publication_status: string }>(`
      SELECT
        (SELECT count(*)::integer FROM works) AS works,
        (SELECT count(*)::integer FROM work_sections) AS sections,
        (SELECT count(*)::integer FROM passages) AS passages,
        passage_count,
        publication_status
      FROM works WHERE id = 'dzg-test-work'
    `)
    expect(counts.rows[0]).toEqual({ works: 1, sections: 1, passages: 0, passage_count: 513, publication_status: 'hidden' })
    await database.close()
  })

  it('is idempotent, hidden from public reads, and rollbackable by batch', async () => {
    const database = new PGlite()
    await database.exec(readFileSync(join(process.cwd(), 'postgres', 'schema.sql'), 'utf8'))
    const passageInsertCounter = { value: 0 }
    const db = adapter(database, passageInsertCounter)
    const input = sample()

    await importWorks(db, input, { passageChunkSize: 250 })
    await importWorks(db, input, { passageChunkSize: 250 })
    expect(passageInsertCounter.value).toBe(6)

    const counts = await database.query<{ works: number; sections: number; passages: number; translations: number; stored_passage_count: number }>(`
      SELECT
        (SELECT count(*)::integer FROM works) AS works,
        (SELECT count(*)::integer FROM work_sections) AS sections,
        (SELECT count(*)::integer FROM passages) AS passages,
        (SELECT count(*)::integer FROM translations) AS translations,
        (SELECT passage_count FROM works LIMIT 1) AS stored_passage_count
    `)
    expect(counts.rows[0]).toEqual({ works: 1, sections: 1, passages: 513, translations: 0, stored_passage_count: 513 })

    const work = await database.query<{ source_verification: string; publication_status: string; content_hash: string }>(
      'SELECT source_verification, publication_status, content_hash FROM works WHERE id = $1',
      ['dzg-test-work'],
    )
    expect(work.rows[0]).toEqual({
      source_verification: 'unverified', publication_status: 'hidden', content_hash: input.works[0].sutra.sha256,
    })
    const publicRows = await database.query("SELECT id FROM works WHERE publication_status = 'published'")
    expect(publicRows.rows).toHaveLength(0)

    const aggregate = await database.query<{ character_count: number; first_hash: string; last_hash: string }>(`
      SELECT
        sum(character_count)::integer AS character_count,
        min(content_hash) FILTER (WHERE sequence = 1) AS first_hash,
        min(content_hash) FILTER (WHERE sequence = 513) AS last_hash
      FROM passages WHERE work_id = 'dzg-test-work'
    `)
    expect(aggregate.rows[0]).toEqual({
      character_count: input.works[0].sutra.char_count,
      first_hash: input.works[0].passages[0].sha256,
      last_hash: input.works[0].passages[512].sha256,
    })

    await database.transaction(async (tx) => {
      await tx.query('DELETE FROM works WHERE source_batch = $1', ['daizhige-test'])
      await tx.query("UPDATE import_jobs SET status = 'rolled_back' WHERE source_batch = $1", ['daizhige-test'])
    })
    const afterRollback = await database.query('SELECT id FROM works')
    expect(afterRollback.rows).toHaveLength(0)
    await database.close()
  })
})
