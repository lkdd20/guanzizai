import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts', 'ingest-daizhige-bulk.mjs')

describe('daizhige bulk ingest dry-run', () => {
  it('excludes forbidden directories and content markers without writing imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'gzz-daizhige-'))
    const source = join(root, 'source')
    const output = join(root, 'output')
    mkdirSync(join(source, '佛藏'), { recursive: true })
    mkdirSync(join(source, '道藏'), { recursive: true })
    mkdirSync(join(source, '子藏', '笔记'), { recursive: true })
    mkdirSync(join(source, '史藏', '传记'), { recursive: true })
    writeFileSync(join(source, '佛藏', '禁用佛经.txt'), '原创占位文本。', 'utf8')
    writeFileSync(join(source, '道藏', '禁用道经.txt'), '正统道藏。', 'utf8')
    writeFileSync(join(source, '子藏', '笔记', '可用笔记.txt'), '第一段。\n\n”疑似异常段落。\n\n第二段。', 'utf8')
    writeFileSync(join(source, '史藏', '传记', '混入来源.txt'), '数据来自 CBETA。', 'utf8')

    execFileSync(process.execPath, [
      scriptPath,
      '--source', source,
      '--out', output,
      '--batch', 'daizhige-test',
      '--dry-run',
    ])

    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'))
    expect(manifest.totals).toEqual({ files: 4, included: 1, excludedByDir: 2, excludedByContent: 1 })
    expect(manifest.included[0].relativePath).toBe('子藏/笔记/可用笔记.txt')
    expect(manifest.textQuality.leadingClosingQuoteLines).toBe(1)
    expect(manifest.excludedByDir.map((item: { relativePath: string }) => item.relativePath).sort()).toEqual([
      '佛藏/禁用佛经.txt',
      '道藏/禁用道经.txt',
    ].sort())
    expect(manifest.excludedByContent[0].reasons).toContain('cbeta-marker')
    expect(() => readFileSync(join(output, 'json', `${manifest.included[0].id}.json`))).toThrow()
  })
})
