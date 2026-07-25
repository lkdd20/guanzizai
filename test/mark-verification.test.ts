import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts', 'mark-verification.mjs')

describe('mark verification script', () => {
  it('generates a reviewable update statement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gzz-verification-'))
    const output = join(dir, 'update.sql')
    execFileSync(process.execPath, [scriptPath, 'dzg-test-book', 'spot_checked', '--out', output])

    const sql = readFileSync(output, 'utf8')
    expect(sql).toContain("SET source_verification = 'spot_checked'")
    expect(sql).toContain("WHERE id = 'dzg-test-book'")
  })

  it('rejects unsupported statuses', () => {
    const result = spawnSync(process.execPath, [scriptPath, 'dzg-test-book', 'published'], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Invalid status')
  })
})
