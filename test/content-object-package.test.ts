import { gunzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts', 'package-upload-content-objects.mjs')

describe('content object packaging', () => {
  it('writes deterministic private gzip objects without uploading by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'gzz-content-object-'))
    const input = join(root, 'json')
    const output = join(root, 'objects')
    mkdirSync(input)
    const work = {
      sutra: { id: 'dzg-object-test', source_batch: 'daizhige-test', sha256: 'a'.repeat(64) },
      passages: [{ id: 'p1', juan: 1, seq: 1, original: '原文。', sha256: 'b'.repeat(64), char_count: 2 }],
    }
    writeFileSync(join(input, 'dzg-object-test.json'), JSON.stringify(work))
    const qa = join(root, 'qa.json')
    writeFileSync(qa, JSON.stringify({ fullReview: [{ id: 'dzg-object-test' }], spotCheck: [] }))

    execFileSync(process.execPath, [script, '--input', input, '--qa', qa, '--batch', 'daizhige-test', '--limit', '1', '--output', output])

    const objectPath = join(output, 'works', 'daizhige-test', 'dzg-object-test.json.gz')
    const payload = JSON.parse(gunzipSync(readFileSync(objectPath)).toString('utf8'))
    expect(payload).toMatchObject({ format: 'guanzizai-work-v1', id: 'dzg-object-test', sourceBatch: 'daizhige-test' })
    expect(payload.passages).toHaveLength(1)
    const manifest = JSON.parse(readFileSync(join(output, 'daizhige-test', 'objects-0-1.json'), 'utf8'))
    expect(manifest.records[0]).toMatchObject({ uploaded: false, passageCount: 1 })
  })

  it('selects a non-overlapping QA window with offset', () => {
    const root = mkdtempSync(join(tmpdir(), 'gzz-content-offset-'))
    const input = join(root, 'json')
    const output = join(root, 'objects')
    mkdirSync(input)
    for (const id of ['work-a', 'work-b']) {
      writeFileSync(join(input, `${id}.json`), JSON.stringify({
        sutra: { id, source_batch: 'daizhige-test', sha256: 'a'.repeat(64) },
        passages: [{ id: `${id}-p1`, juan: 1, seq: 1, original: id, sha256: 'b'.repeat(64), char_count: id.length }],
      }))
    }
    const qa = join(root, 'qa.json')
    writeFileSync(qa, JSON.stringify({ fullReview: [{ id: 'work-a' }, { id: 'work-b' }], spotCheck: [] }))

    execFileSync(process.execPath, [script, '--input', input, '--qa', qa, '--batch', 'daizhige-test', '--offset', '1', '--limit', '1', '--output', output])

    const manifest = JSON.parse(readFileSync(join(output, 'daizhige-test', 'objects-1-1.json'), 'utf8'))
    expect(manifest).toMatchObject({ offset: 1, limit: 1 })
    expect(manifest.records.map((record: { id: string }) => record.id)).toEqual(['work-b'])
  })
})
