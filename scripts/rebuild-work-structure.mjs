#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { deriveWorkStructure, sectionForPassage } from './lib/work-structure.mjs'

function usage() {
  return [
    'Usage: node scripts/rebuild-work-structure.mjs [options]',
    '',
    '  --work <id>          Rebuild one work',
    '  --batch <id>         Rebuild every work in a source batch',
    '  --published          Rebuild all published works',
    '  --migration <file>   Migration SQL (default: postgres/migrations/0005_structured_work_navigation.sql)',
    '  --database-url <url> PostgreSQL direct URL (defaults to DATABASE_DIRECT_URL)',
    '  --dry-run            Parse and report only; do not write',
  ].join('\n')
}

function parseArgs(argv) {
  const args = {
    work: '',
    batch: '',
    published: false,
    dryRun: false,
    migration: resolve('postgres/migrations/0005_structured_work_navigation.sql'),
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--published' || arg === '--dry-run') {
      args[arg.slice(2)] = true
      continue
    }
    const key = { '--work': 'work', '--batch': 'batch', '--migration': 'migration', '--database-url': 'databaseUrl' }[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'migration' ? resolve(value) : value
    index += 1
  }
  if ([Boolean(args.work), Boolean(args.batch), args.published].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one selector: --work, --batch, or --published')
  }
  if (!args.databaseUrl) throw new Error('DATABASE_DIRECT_URL or --database-url is required')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { default: postgres } = await import('postgres')
  const sql = postgres(args.databaseUrl, { max: 1, prepare: false })
  try {
    if (!args.dryRun) await sql.unsafe(await readFile(args.migration, 'utf8'))
    const works = args.work
      ? await sql`SELECT id, title FROM works WHERE id = ${args.work}`
      : args.batch
        ? await sql`SELECT id, title FROM works WHERE source_batch = ${args.batch} ORDER BY id`
        : await sql`SELECT id, title FROM works WHERE publication_status = 'published' ORDER BY id`
    let sectionCount = 0
    for (const work of works) {
      const rows = await sql`
        SELECT id, sequence AS seq, original_text AS original, character_count AS char_count
        FROM passages WHERE work_id = ${work.id} ORDER BY sequence
      `
      if (!rows.length) continue
      const passages = rows.map((row) => ({
        id: String(row.id), seq: Number(row.seq), original: String(row.original), char_count: Number(row.char_count),
      }))
      const structure = deriveWorkStructure({ sutra: { title_zh: String(work.title) }, passages })
      sectionCount += structure.length
      if (args.dryRun) {
        console.log(JSON.stringify({ id: work.id, title: work.title, passages: passages.length, sections: structure.length }))
        continue
      }
      await sql.begin(async (tx) => {
        const placeholderKey = `__rebuild__-${Date.now()}`
        const [placeholder] = await tx`
          INSERT INTO work_sections (
            work_id, section_key, title, juan, sequence, kind, level,
            end_sequence, content_hash, character_count
          ) VALUES (
            ${work.id}, ${placeholderKey}, '结构重建中', 1, 1, 'body', 1,
            ${passages.at(-1)?.seq ?? 1}, ${structure[0].contentHash}, 0
          ) RETURNING id
        `
        await tx`UPDATE passages SET section_id = ${placeholder.id} WHERE work_id = ${work.id}`
        await tx`DELETE FROM work_sections WHERE work_id = ${work.id} AND id <> ${placeholder.id}`
        const ids = new Map()
        for (const item of structure) {
          const [section] = await tx`
            INSERT INTO work_sections (
              work_id, section_key, title, juan, sequence, kind, level,
              parent_section_key, end_sequence, content_hash, character_count
            ) VALUES (
              ${work.id}, ${item.key}, ${item.title}, ${item.juan}, ${item.sequence}, ${item.kind}, ${item.level},
              ${item.parentKey}, ${item.endSequence}, ${item.contentHash}, ${item.characterCount}
            ) RETURNING id
          `
          ids.set(item.key, section.id)
        }
        for (const passage of passages) {
          const section = sectionForPassage(structure, passage.seq)
          await tx`UPDATE passages SET section_id = ${ids.get(section.key)} WHERE id = ${passage.id}`
        }
        await tx`DELETE FROM work_sections WHERE id = ${placeholder.id}`
      })
    }
    console.log(JSON.stringify({ dryRun: args.dryRun, works: works.length, sections: sectionCount }))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
