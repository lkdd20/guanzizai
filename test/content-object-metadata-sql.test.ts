import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts', 'generate-content-object-metadata-sql.mjs')

describe('content object metadata SQL', () => {
  it('updates object metadata without changing trust or publication states', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gzz-object-sql-'))
    const manifest = join(dir, 'objects.json')
    const output = join(dir, 'update.sql')
    writeFileSync(manifest, JSON.stringify({ records: [{
      id: 'dzg-test', batch: 'batch-test', key: 'works/test.json.gz', bytes: 123,
      objectHash: 'a'.repeat(64), passageCount: 4,
    }] }))
    execFileSync(process.execPath, [script, '--manifest', manifest, '--out', output])
    const sql = readFileSync(output, 'utf8')
    expect(sql).toContain('content_object_key = m.object_key')
    expect(sql).toContain("content_encoding = 'gzip'")
    expect(sql).not.toContain('SET publication_status')
    expect(sql).not.toContain('SET source_verification')
  })
})
