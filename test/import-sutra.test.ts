import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts', 'import-sutra.mjs')

function sha256(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function sampleSutra(overrides: Record<string, unknown> = {}) {
  const first = '晨光入窗。'
  const second = '读者展卷。'
  return {
    id: 'PD0001',
    title_zh: '測試讀本',
    byline: '測試作者',
    dynasty: '當代',
    canon: '公有领域',
    category: '開發示例',
    source_edition: '公有领域文本，经人工核验',
    juan_count: 1,
    char_count: 8,
    sha256: sha256(first + second),
    passages: [
      {
        id: 'PD0001_j1_0001',
        juan: 1,
        seq: 1,
        original: first,
        char_count: 4,
        sha256: sha256(first),
        translation: {
          lang: 'zh-Hans',
          content: '这是白话草稿。',
          status: 'draft',
          model: 'manual-test',
        },
      },
      {
        id: 'PD0001_j1_0002',
        juan: 1,
        seq: 2,
        original: second,
        char_count: 4,
        sha256: sha256(second),
      },
    ],
    ...overrides,
  }
}

function runImport(input: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'gzz-import-'))
  const jsonPath = join(dir, 'sutra.json')
  const sqlPath = join(dir, 'sutra.sql')
  writeFileSync(jsonPath, JSON.stringify(input, null, 2), 'utf8')
  execFileSync(process.execPath, [scriptPath, jsonPath, '--out', sqlPath], { encoding: 'utf8' })
  return readFileSync(sqlPath, 'utf8')
}

function runImportFailure(input: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'gzz-import-'))
  const jsonPath = join(dir, 'sutra.json')
  writeFileSync(jsonPath, JSON.stringify(input, null, 2), 'utf8')
  return spawnSync(process.execPath, [scriptPath, jsonPath, '--out', join(dir, 'sutra.sql')], {
    encoding: 'utf8',
  })
}

describe('sutra import script', () => {
  it('generates idempotent D1 SQL for a verified JSON file', () => {
    const sql = runImport(sampleSutra())

    expect(sql).toContain('INSERT OR REPLACE INTO sutras')
    expect(sql).toContain('INSERT OR REPLACE INTO passages')
    expect(sql).toContain('INSERT OR REPLACE INTO translations')
    expect(sql).toContain("DELETE FROM translations WHERE passage_id IN ('PD0001_j1_0001', 'PD0001_j1_0002');")
    expect(sql).toContain("'国学'")
    expect(sql).toContain("'verified'")
    expect(sql).toContain("'公有领域文本，经人工核验'")
    expect(sql).toContain('NULL, 4,')
    expect(sql).toContain("'draft'")
    expect(sql).toContain('COMMIT;')
  })

  it('rejects stale passage fingerprints', () => {
    const sutra = sampleSutra()
    sutra.passages[0].sha256 = sha256('wrong text')

    const result = runImportFailure(sutra)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('passages[0].sha256 mismatch')
  })

  it('requires a source edition before import', () => {
    const result = runImportFailure(sampleSutra({ source_edition: '' }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('sutra.source_edition is required')
  })

  it('rejects non-empty CBETA line references', () => {
    const sutra = sampleSutra()
    const passages = sutra.passages as Array<Record<string, unknown>>
    passages[0] = { ...passages[0], cbeta_line_ref: 'T08n0251_p0848c07' }

    const result = runImportFailure(sutra)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('cbeta_line_ref must be null')
  })

  it('accepts guoxue library imports through the same script', () => {
    const sql = runImport(sampleSutra({
      library: '国学',
      category: '笔记小说',
      canon: '公有领域',
      source_verification: 'unverified',
      source_batch: 'daizhige-test',
    }))

    expect(sql).toContain("'国学'")
    expect(sql).toContain("'笔记小说'")
    expect(sql).toContain("'unverified'")
    expect(sql).toContain("'daizhige-test'")
  })
})
