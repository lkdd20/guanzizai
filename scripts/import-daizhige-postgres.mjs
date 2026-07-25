#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { deriveWorkStructure, sectionForPassage } from './lib/work-structure.mjs'

const defaultPassageChunkSize = 250
const passageColumnCount = 8
const postgresParameterLimit = 65535

function usage() {
  return [
    'Usage: node scripts/import-daizhige-postgres.mjs [options]',
    '',
    '  --input <dir>          Batch JSON directory',
    '  --manifest <file>      Batch manifest.json',
    '  --qa <file>            qa-sample-list.json',
    '  --limit <n>            Sample size (default: 20, max: 500)',
    '  --offset <n>           Skip this many QA-ordered works (default: 0)',
    '  --metadata-only        Store work/section metadata without passage text',
    '  --database-url <url>   PostgreSQL URL; omit to write an import plan only',
    '  --plan <file>          Plan output (default: out/postgres-sample-plan.json)',
    `  --passage-chunk-size <n>  Passages per multi-row UPSERT (default: ${defaultPassageChunkSize})`,
  ].join('\n')
}

function parseArgs(argv) {
  const args = {
    input: 'out/daizhige-2026-07-11/json',
    manifest: 'out/daizhige-2026-07-11/manifest.json',
    qa: 'out/daizhige-2026-07-11/qa-sample-list.json',
    limit: 20,
    offset: 0,
    metadataOnly: false,
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || '',
    plan: 'out/postgres-sample-plan.json',
    passageChunkSize: defaultPassageChunkSize,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--metadata-only') {
      args.metadataOnly = true
      continue
    }
    const key = {
      '--input': 'input', '--manifest': 'manifest', '--qa': 'qa', '--limit': 'limit', '--offset': 'offset',
      '--database-url': 'databaseUrl', '--plan': 'plan', '--passage-chunk-size': 'passageChunkSize',
    }[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = ['limit', 'offset', 'passageChunkSize'].includes(key) ? Number(value) : value
    index += 1
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) throw new Error('--limit must be 1-500')
  if (!Number.isInteger(args.offset) || args.offset < 0) throw new Error('--offset must be a non-negative integer')
  if (
    !Number.isInteger(args.passageChunkSize) ||
    args.passageChunkSize < 1 ||
    args.passageChunkSize > Math.floor(postgresParameterLimit / passageColumnCount)
  ) {
    throw new Error(`--passage-chunk-size must be 1-${Math.floor(postgresParameterLimit / passageColumnCount)}`)
  }
  for (const key of ['input', 'manifest', 'qa', 'plan']) args[key] = resolve(process.cwd(), args[key])
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sourcePath(sourceEdition) {
  const match = sourceEdition.match(/daizhigev20 · (.+?) · 批量收录/)
  if (!match) throw new Error(`Cannot parse source path: ${sourceEdition}`)
  return match[1]
}

async function selectSample(args) {
  const manifestText = await readFile(args.manifest, 'utf8')
  const manifest = JSON.parse(manifestText)
  const qa = JSON.parse(await readFile(args.qa, 'utf8'))
  const ordered = []
  const seen = new Set()
  for (const entry of [...qa.fullReview, ...qa.spotCheck]) {
    if (!seen.has(entry.id)) {
      ordered.push(entry)
      seen.add(entry.id)
    }
  }
  const selected = ordered.slice(args.offset, args.offset + args.limit)
  if (selected.length !== args.limit) throw new Error(`Only ${selected.length} sample works available`)
  const works = []
  for (const entry of selected) {
    const data = JSON.parse(await readFile(join(args.input, `${entry.id}.json`), 'utf8'))
    if (data.sutra.source_verification !== 'unverified') throw new Error(`${entry.id} is not unverified`)
    works.push(data)
  }
  return { manifest, manifestHash: sha256(manifestText), works }
}

function buildPlan(batch, works, manifestHash) {
  return {
    generatedAt: new Date().toISOString(),
    sourceBatch: batch,
    manifestHash,
    defaults: { sourceVerification: 'unverified', publicationStatus: 'hidden', translations: 0 },
    totals: {
      works: works.length,
      sections: works.reduce((sum, work) => sum + deriveWorkStructure(work).length, 0),
      passages: works.reduce((sum, work) => sum + work.passages.length, 0),
      characters: works.reduce((sum, work) => sum + work.sutra.char_count, 0),
    },
    works: works.map((work) => ({
      id: work.sutra.id,
      title: work.sutra.title_zh,
      sourcePath: sourcePath(work.sutra.source_edition),
      contentHash: work.sutra.sha256,
      passages: work.passages.length,
      characters: work.sutra.char_count,
    })),
  }
}

function chunks(values, size) {
  const output = []
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size))
  return output
}

async function insertPassageChunk(tx, workId, sectionIds, structure, importedAt, passages) {
  if (!passages.length) return
  const params = []
  const values = passages.map((passage, rowIndex) => {
    const offset = rowIndex * passageColumnCount
    params.push(
      passage.id,
      workId,
      sectionIds.get(sectionForPassage(structure, passage.seq).key),
      passage.seq,
      passage.original,
      passage.sha256,
      passage.char_count,
      importedAt,
    )
    return `(${Array.from({ length: passageColumnCount }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`
  })
  await tx.query(`
    INSERT INTO passages (id, work_id, section_id, sequence, original_text, content_hash, character_count, imported_at)
    VALUES ${values.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      work_id = EXCLUDED.work_id, section_id = EXCLUDED.section_id, sequence = EXCLUDED.sequence,
      original_text = EXCLUDED.original_text, content_hash = EXCLUDED.content_hash,
      character_count = EXCLUDED.character_count, imported_at = EXCLUDED.imported_at
  `, params)
}

export async function importWorks(db, { manifest, manifestHash, works }, options = {}) {
  const batch = manifest.batch
  const passageChunkSize = options.passageChunkSize ?? defaultPassageChunkSize
  const metadataOnly = options.metadataOnly ?? false
  if (!Number.isInteger(passageChunkSize) || passageChunkSize < 1 || passageChunkSize * passageColumnCount > postgresParameterLimit) {
    throw new Error('Invalid passageChunkSize')
  }
  return db.transaction(async (tx) => {
    await tx.query(`
      INSERT INTO source_batches (id, source_name, source_repository, source_commit, manifest_hash, rights_note)
      VALUES ($1, 'daizhige', $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        source_repository = EXCLUDED.source_repository,
        source_commit = EXCLUDED.source_commit,
        manifest_hash = EXCLUDED.manifest_hash,
        rights_note = EXCLUDED.rights_note
    `, [batch, manifest.source.repository, manifest.source.commit, manifestHash,
      '非佛道古典文学；来源如实标注 daizhige；权利人异议时立即下架，不作对抗性主张。'])

    const job = await tx.query(`
      INSERT INTO import_jobs (source_batch, requested_count) VALUES ($1, $2) RETURNING id
    `, [batch, works.length])
    const jobId = job.rows[0].id

    for (const work of works) {
      const sutra = work.sutra
      const path = sourcePath(sutra.source_edition)
      await tx.query(`
        INSERT INTO works (
          id, library, source_batch, source_verification, publication_status, source_edition,
          source_path, title, author, dynasty, category, content_hash, character_count, imported_at, published_at
          , passage_count
        ) VALUES ($1, '国学', $2, 'unverified', 'hidden', $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
        ON CONFLICT (id) DO UPDATE SET
          library = '国学', source_batch = EXCLUDED.source_batch, source_verification = 'unverified',
          publication_status = 'hidden', source_edition = EXCLUDED.source_edition,
          source_path = EXCLUDED.source_path, title = EXCLUDED.title, author = EXCLUDED.author,
          dynasty = EXCLUDED.dynasty, category = EXCLUDED.category, content_hash = EXCLUDED.content_hash,
          character_count = EXCLUDED.character_count, passage_count = EXCLUDED.passage_count,
          imported_at = EXCLUDED.imported_at, published_at = NULL
      `, [sutra.id, batch, sutra.source_edition, path, sutra.title_zh, sutra.byline, sutra.dynasty,
        sutra.category, sutra.sha256, sutra.char_count, sutra.created_at, work.passages.length])

      await tx.query('DELETE FROM work_sections WHERE work_id = $1', [sutra.id])
      const structure = deriveWorkStructure(work)
      const sectionIds = new Map()
      for (const item of structure) {
        const section = await tx.query(`
          INSERT INTO work_sections (
            work_id, section_key, title, juan, sequence, kind, level,
            parent_section_key, end_sequence, content_hash, character_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
        `, [
          sutra.id, item.key, item.title, item.juan, item.sequence, item.kind, item.level,
          item.parentKey, item.endSequence, item.contentHash, item.characterCount,
        ])
        sectionIds.set(item.key, section.rows[0].id)
      }

      if (!metadataOnly) {
        for (const passageChunk of chunks(work.passages, passageChunkSize)) {
          await insertPassageChunk(tx, sutra.id, sectionIds, structure, sutra.created_at, passageChunk)
        }
      }
    }

    await tx.query(`
      UPDATE import_jobs SET status = 'completed', imported_count = $1, completed_at = now() WHERE id = $2
    `, [works.length, jobId])
    return { jobId, importedCount: works.length }
  })
}

async function connect(url) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { max: 1, prepare: false })
  return {
    query: async (text, params = []) => {
      const rows = await sql.unsafe(text, params)
      return { rows }
    },
    transaction: async (callback) => sql.begin(async (tx) => callback({
      query: async (text, params = []) => ({ rows: await tx.unsafe(text, params) }),
    })),
    close: () => sql.end(),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sample = await selectSample(args)
  const plan = buildPlan(sample.manifest.batch, sample.works, sample.manifestHash)
  await writeFile(args.plan, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${args.plan}`)
  console.log(JSON.stringify(plan.totals))
  if (!args.databaseUrl) {
    console.log('No database URL supplied; plan-only mode, no database writes performed.')
    return
  }
  const db = await connect(args.databaseUrl)
  try {
    console.log(JSON.stringify(await importWorks(db, sample, {
      passageChunkSize: args.passageChunkSize,
      metadataOnly: args.metadataOnly,
    })))
  } finally {
    await db.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
}
