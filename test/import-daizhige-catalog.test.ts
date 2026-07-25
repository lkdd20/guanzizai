import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import {
  buildCatalogPlan,
  buildCatalogUpsert,
  classifyManifestEntry,
  importCatalogWorks,
  mapManifestEntry,
  selectCatalogEntries,
} from '../scripts/import-daizhige-catalog.mjs'

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

interface TestDatabase {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  transaction<T>(callback: (tx: TestDatabase) => Promise<T>): Promise<T>
}

function adapter(database: PGlite): TestDatabase {
  const db: TestDatabase = {
    query: (text, params = []) => database.query(text, params),
    transaction: <T>(callback: (tx: TestDatabase) => Promise<T>) => database.transaction(async (tx) => callback({
      query: (text, params = []) => tx.query(text, params),
      transaction: db.transaction,
    })),
  }
  return db
}

function manifest() {
  return {
    generatedAt: '2026-07-11T05:33:40.118Z',
    batch: 'daizhige-test',
    source: { repository: 'https://example.test/daizhige', commit: 'abc123' },
    excludedByDir: [{ id: 'forbidden' }],
    excludedByContent: [],
    included: [
      {
        id: 'dzg-one', title: '第一部', relativePath: '子藏/笔记/第一部.txt', category: '笔记',
        sourceSha256: hash('one'), passageCount: 12, charCount: 345,
      },
      {
        id: 'dzg-two', title: '第二部', relativePath: '史藏/传记/第二部.txt', category: '传记',
        sourceSha256: hash('two'), passageCount: 23, charCount: 678,
      },
      {
        id: 'dzg-composite', title: '东宫部',
        relativePath: '子藏/类书/古今图书集成/明伦汇编/宫闱典东宫部.txt', category: '类书',
        sourceSha256: hash('composite'), passageCount: 34, charCount: 789,
      },
    ],
  }
}

describe('Daizhige catalog-only import', () => {
  it('maps manifest metadata and applies offset/limit without reading source texts', () => {
    const input = manifest()
    const first = mapManifestEntry(input.included[0], input)
    expect(first).toMatchObject({
      id: 'dzg-one',
      sourceBatch: 'daizhige-test',
      sourceEdition: 'daizhigev20 · 子藏/笔记/第一部.txt · 批量收录',
      sourcePath: '子藏/笔记/第一部.txt',
      title: '第一部',
      author: null,
      dynasty: null,
      category: '笔记',
      contentHash: hash('one'),
      characterCount: 345,
      passageCount: 12,
    })
    expect(selectCatalogEntries(input, 1, 1).map((work) => work.id)).toEqual(['dzg-two'])
    const plan = buildCatalogPlan(input, hash('manifest'), selectCatalogEntries(input, 0, 2), 0)
    expect(plan.defaults).toEqual({
      library: '国学', sourceVerification: 'unverified', publicationStatus: 'catalog_only', translations: 0,
    })
    expect(plan.totals).toMatchObject({
      selectedWorks: 2,
      manifestSourceFiles: 3,
      independentWorkCandidates: 2,
      compositeSectionsExcluded: 1,
      passagesDeclared: 35,
    })
  })

  it('does not mistake a composite-classic section for an independent work', () => {
    const input = manifest()
    expect(classifyManifestEntry(input.included[2])).toMatchObject({ kind: 'composite_section' })
    expect(selectCatalogEntries(input, 0, 10).map((work) => work.id)).toEqual(['dzg-one', 'dzg-two'])
  })

  it('uses a catalog-only UPSERT that preserves published records', () => {
    const query = buildCatalogUpsert(selectCatalogEntries(manifest(), 0, 1))
    expect(query.text).toContain("ELSE 'catalog_only'::publication_status")
    expect(query.text).toContain("WHEN works.publication_status = 'published' THEN works.title")
    expect(query.text).toContain('published_at = works.published_at')
    expect(query.text).toContain('WHERE works.source_batch = EXCLUDED.source_batch')
    expect(query.text).toContain("OR works.publication_status = 'published'")
    expect(query.text).not.toMatch(/work_sections|passages|translations/)
  })

  it('is idempotent, promotes hidden records, and never stores or deletes body data', async () => {
    const database = new PGlite()
    await database.exec(readFileSync(join(process.cwd(), 'postgres', 'schema.sql'), 'utf8'))
    const db = adapter(database)
    const input = manifest()
    const works = selectCatalogEntries(input, 0, 2)
    const payload = { manifest: input, manifestHash: hash('manifest'), works }

    await importCatalogWorks(db, payload)
    await database.query("UPDATE works SET publication_status='hidden' WHERE id='dzg-one'")
    await importCatalogWorks(db, payload)

    const counts = await database.query<{
      works: number
      sections: number
      passages: number
      translations: number
      completed_jobs: number
    }>(`
      SELECT
        (SELECT count(*)::integer FROM works) AS works,
        (SELECT count(*)::integer FROM work_sections) AS sections,
        (SELECT count(*)::integer FROM passages) AS passages,
        (SELECT count(*)::integer FROM translations) AS translations,
        (SELECT count(*)::integer FROM import_jobs WHERE status='completed') AS completed_jobs
    `)
    expect(counts.rows[0]).toEqual({ works: 2, sections: 0, passages: 0, translations: 0, completed_jobs: 2 })
    const statuses = await database.query<{ id: string; publication_status: string; source_verification: string }>(
      'SELECT id, publication_status, source_verification FROM works ORDER BY id',
    )
    expect(statuses.rows).toEqual([
      { id: 'dzg-one', publication_status: 'catalog_only', source_verification: 'unverified' },
      { id: 'dzg-two', publication_status: 'catalog_only', source_verification: 'unverified' },
    ])
    await database.close()
  })

  it('does not downgrade or overwrite a published work from the same batch', async () => {
    const database = new PGlite()
    await database.exec(readFileSync(join(process.cwd(), 'postgres', 'schema.sql'), 'utf8'))
    const db = adapter(database)
    const input = manifest()
    const works = selectCatalogEntries(input, 0, 1)
    await importCatalogWorks(db, { manifest: input, manifestHash: hash('manifest'), works })
    await database.query(`
      UPDATE works SET publication_status='published', published_at=now(), title='人工发布标题',
        source_verification='verified', character_count=999
      WHERE id='dzg-one'
    `)

    await importCatalogWorks(db, { manifest: input, manifestHash: hash('manifest'), works })
    const result = await database.query<{
      publication_status: string
      source_verification: string
      title: string
      character_count: number
      published_at: Date | null
    }>('SELECT publication_status, source_verification, title, character_count, published_at FROM works WHERE id=$1', ['dzg-one'])
    expect(result.rows[0]).toMatchObject({
      publication_status: 'published', source_verification: 'verified', title: '人工发布标题', character_count: 999,
    })
    expect(result.rows[0].published_at).not.toBeNull()
    await database.close()
  })

  it('preserves a published work owned by another source batch', async () => {
    const database = new PGlite()
    await database.exec(readFileSync(join(process.cwd(), 'postgres', 'schema.sql'), 'utf8'))
    const db = adapter(database)
    const input = manifest()
    const works = selectCatalogEntries(input, 0, 1)

    await database.query(
      `INSERT INTO source_batches (id, source_name, manifest_hash, rights_note)
       VALUES ('newer-reviewed-source', 'wikisource', 'newer-manifest', 'public domain test fixture')`,
    )
    await database.query(`
      INSERT INTO works (
        id, source_batch, source_edition, source_path, title, library, source_verification,
        publication_status, content_hash, character_count, passage_count, published_at
      ) VALUES (
        'dzg-one', 'newer-reviewed-source', '固定修订', 'source/one', '新版第一部', '国学',
        'verified', 'published', '${hash('published')}', 999, 9, now()
      )
    `)

    const result = await importCatalogWorks(db, {
      manifest: input,
      manifestHash: hash('manifest'),
      works,
    })
    expect(result.importedCount).toBe(1)

    const preserved = await database.query<{
      source_batch: string
      source_edition: string
      title: string
      source_verification: string
      publication_status: string
      content_hash: string
      character_count: number
    }>('SELECT source_batch, source_edition, title, source_verification, publication_status, content_hash, character_count FROM works WHERE id=$1', ['dzg-one'])
    expect(preserved.rows[0]).toEqual({
      source_batch: 'newer-reviewed-source',
      source_edition: '固定修订',
      title: '新版第一部',
      source_verification: 'verified',
      publication_status: 'published',
      content_hash: hash('published'),
      character_count: 999,
    })
    await database.close()
  })
})
