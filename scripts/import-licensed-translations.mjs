#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

function parseArgs(argv) {
  const args = { file: '', sourceName: '', sourceUrl: '', licenseNote: '', databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || '' }
  for (let index = 0; index < argv.length; index += 1) {
    const key = {
      '--file': 'file', '--source-name': 'sourceName', '--source-url': 'sourceUrl',
      '--license-note': 'licenseNote', '--database-url': 'databaseUrl',
    }[argv[index]]
    if (!key) throw new Error(`Unknown option: ${argv[index]}`)
    const value = argv[++index]
    if (!value) throw new Error(`${argv[index - 1]} requires a value`)
    args[key] = value
  }
  for (const key of ['file', 'sourceName', 'licenseNote', 'databaseUrl']) {
    if (!args[key]) throw new Error(`Missing required option: ${key}`)
  }
  return args
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const records = JSON.parse(await readFile(args.file, 'utf8'))
  if (!Array.isArray(records) || !records.length) throw new Error('Input must be a non-empty JSON array')
  const sql = postgres(args.databaseUrl, { max: 1, prepare: false })
  try {
    await sql.begin(async (tx) => {
      for (const [index, record] of records.entries()) {
        if (!record?.passageId || !record?.sourceContentHash || !record?.content) throw new Error(`Invalid record at index ${index}`)
        const [passage] = await tx`SELECT content_hash FROM passages WHERE id = ${record.passageId} LIMIT 1`
        if (!passage) throw new Error(`Unknown passage: ${record.passageId}`)
        if (String(passage.content_hash) !== record.sourceContentHash) throw new Error(`Source hash mismatch: ${record.passageId}`)
        await tx`
          INSERT INTO translations (
            passage_id, language, content, content_hash, source_content_hash, origin,
            source_name, source_url, license_note, quality_report, status
          ) VALUES (
            ${record.passageId}, 'zh-Hans', ${record.content}, ${sha256(record.content)}, ${record.sourceContentHash},
            'licensed', ${args.sourceName}, ${args.sourceUrl || null}, ${args.licenseNote},
            ${tx.json({ imported: true })}, 'draft'
          )
          ON CONFLICT (passage_id, language) DO UPDATE SET
            content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
            source_content_hash = EXCLUDED.source_content_hash, origin = 'licensed',
            source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url,
            license_note = EXCLUDED.license_note, quality_report = EXCLUDED.quality_report,
            status = 'draft', reviewer = NULL, published_at = NULL
        `
      }
    })
    console.log(`Imported ${records.length} licensed translations as draft from ${args.sourceName}`)
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
