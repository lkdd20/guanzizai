#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const defaultManifest = 'out/daizhige-2026-07-11/manifest.json'
const defaultLimit = 500
const maxLimit = 500

function usage() {
  return [
    'Usage: node scripts/import-daizhige-catalog.mjs [options]',
    '',
    '  --manifest <file>      manifest.json (default: out/daizhige-2026-07-11/manifest.json)',
    `  --limit <n>            Number of catalog entries (default: ${defaultLimit}, max: ${maxLimit})`,
    '  --offset <n>           Skip this many manifest entries (default: 0)',
    '  --database-url <url>   PostgreSQL URL; omit for plan-only mode',
    '  --plan <file>          Optionally write the selected import plan as JSON',
    '  --dry-run              Never connect to PostgreSQL, even if a URL is supplied',
  ].join('\n')
}

export function parseCatalogArgs(argv, env = process.env) {
  const args = {
    manifest: defaultManifest,
    limit: defaultLimit,
    offset: 0,
    databaseUrl: env.DATABASE_DIRECT_URL?.trim() || env.DATABASE_URL?.trim() || '',
    plan: '',
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    const key = {
      '--manifest': 'manifest',
      '--limit': 'limit',
      '--offset': 'offset',
      '--database-url': 'databaseUrl',
      '--plan': 'plan',
    }[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'limit' || key === 'offset' ? Number(value) : value
    index += 1
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > maxLimit) {
    throw new Error(`--limit must be 1-${maxLimit}`)
  }
  if (!Number.isInteger(args.offset) || args.offset < 0) {
    throw new Error('--offset must be a non-negative integer')
  }
  args.manifest = resolve(process.cwd(), args.manifest)
  if (args.plan) args.plan = resolve(process.cwd(), args.plan)
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}`)
  return value.trim()
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${field}`)
  return value
}

export function mapManifestEntry(entry, manifest) {
  const relativePath = requiredString(entry.relativePath, 'relativePath')
  return {
    id: requiredString(entry.id, 'id'),
    sourceBatch: requiredString(manifest.batch, 'batch'),
    sourceEdition: `daizhigev20 · ${relativePath} · 批量收录`,
    sourcePath: relativePath,
    title: requiredString(entry.title, 'title'),
    author: null,
    dynasty: null,
    category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
    contentHash: requiredString(entry.sourceSha256, 'sourceSha256'),
    characterCount: nonNegativeInteger(entry.charCount, 'charCount'),
    passageCount: nonNegativeInteger(entry.passageCount, 'passageCount'),
    importedAt: typeof manifest.generatedAt === 'string' && manifest.generatedAt
      ? manifest.generatedAt
      : new Date().toISOString(),
  }
}

export function classifyManifestEntry(entry) {
  const relativePath = requiredString(entry.relativePath, 'relativePath').replaceAll('\\', '/')
  const pathParts = relativePath.split('/').filter(Boolean)
  const compositeRootIndex = pathParts.findIndex((part) => part === '古今图书集成')

  if (compositeRootIndex >= 0 && pathParts.length > compositeRootIndex + 1) {
    return {
      kind: 'composite_section',
      reason: '《古今图书集成》的下级典、部或汇编应进入 work_sections，不是独立 works',
    }
  }

  return { kind: 'independent_work_candidate', reason: null }
}

export function selectCatalogEntries(manifest, offset, limit) {
  if (!Array.isArray(manifest.included)) throw new Error('Manifest included list is missing')
  const candidates = manifest.included.filter(
    (entry) => classifyManifestEntry(entry).kind === 'independent_work_candidate',
  )
  if (offset >= candidates.length) return []
  return candidates.slice(offset, offset + limit).map((entry) => mapManifestEntry(entry, manifest))
}

export function buildCatalogPlan(manifest, manifestHash, works, offset) {
  return {
    generatedAt: new Date().toISOString(),
    sourceBatch: manifest.batch,
    manifestHash,
    offset,
    defaults: {
      library: '国学',
      sourceVerification: 'unverified',
      publicationStatus: 'catalog_only',
      translations: 0,
    },
    totals: {
      selectedWorks: works.length,
      manifestSourceFiles: Array.isArray(manifest.included) ? manifest.included.length : 0,
      independentWorkCandidates: Array.isArray(manifest.included)
        ? manifest.included.filter((entry) => classifyManifestEntry(entry).kind === 'independent_work_candidate').length
        : 0,
      compositeSectionsExcluded: Array.isArray(manifest.included)
        ? manifest.included.filter((entry) => classifyManifestEntry(entry).kind === 'composite_section').length
        : 0,
      passagesDeclared: works.reduce((sum, work) => sum + work.passageCount, 0),
      charactersDeclared: works.reduce((sum, work) => sum + work.characterCount, 0),
    },
    works,
  }
}

function placeholders(rowIndex, columnTypes) {
  const start = rowIndex * columnTypes.length + 1
  return `(${columnTypes.map((type, index) => `$${start + index}::${type}`).join(', ')})`
}

export function buildCatalogUpsert(works) {
  if (!works.length) throw new Error('No catalog works selected')
  const columns = [
    'id', 'source_batch', 'source_edition', 'source_path', 'title', 'author', 'dynasty',
    'category', 'content_hash', 'character_count', 'passage_count', 'imported_at',
  ]
  const columnTypes = [
    'text', 'text', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'bigint', 'integer', 'timestamptz',
  ]
  const params = []
  for (const work of works) {
    params.push(
      work.id, work.sourceBatch, work.sourceEdition, work.sourcePath, work.title, work.author,
      work.dynasty, work.category, work.contentHash, work.characterCount, work.passageCount, work.importedAt,
    )
  }
  const values = works.map((_, index) => placeholders(index, columnTypes)).join(',\n')
  const text = `
    INSERT INTO works (
      id, source_batch, source_edition, source_path, title, author, dynasty, category,
      content_hash, character_count, passage_count, imported_at,
      library, source_verification, publication_status, published_at
    )
    SELECT input.*, '国学', 'unverified', 'catalog_only', NULL
    FROM (VALUES ${values}) AS input (${columns.join(', ')})
    ON CONFLICT (id) DO UPDATE SET
      source_verification = CASE
        WHEN works.publication_status = 'published' THEN works.source_verification
        ELSE 'unverified'
      END,
      publication_status = CASE
        WHEN works.publication_status = 'published' THEN 'published'::publication_status
        ELSE 'catalog_only'::publication_status
      END,
      published_at = works.published_at,
      source_edition = CASE WHEN works.publication_status = 'published' THEN works.source_edition ELSE EXCLUDED.source_edition END,
      source_path = CASE WHEN works.publication_status = 'published' THEN works.source_path ELSE EXCLUDED.source_path END,
      title = CASE WHEN works.publication_status = 'published' THEN works.title ELSE EXCLUDED.title END,
      author = CASE WHEN works.publication_status = 'published' THEN works.author ELSE EXCLUDED.author END,
      dynasty = CASE WHEN works.publication_status = 'published' THEN works.dynasty ELSE EXCLUDED.dynasty END,
      category = CASE WHEN works.publication_status = 'published' THEN works.category ELSE EXCLUDED.category END,
      content_hash = CASE WHEN works.publication_status = 'published' THEN works.content_hash ELSE EXCLUDED.content_hash END,
      character_count = CASE WHEN works.publication_status = 'published' THEN works.character_count ELSE EXCLUDED.character_count END,
      passage_count = CASE WHEN works.publication_status = 'published' THEN works.passage_count ELSE EXCLUDED.passage_count END,
      imported_at = CASE WHEN works.publication_status = 'published' THEN works.imported_at ELSE EXCLUDED.imported_at END
    WHERE works.source_batch = EXCLUDED.source_batch
       OR works.publication_status = 'published'
    RETURNING id
  `
  return { text, params }
}

export async function importCatalogWorks(db, { manifest, manifestHash, works }) {
  const batch = requiredString(manifest.batch, 'batch')
  const metadata = JSON.stringify({
    catalogOnly: true,
    manifestIncluded: Array.isArray(manifest.included) ? manifest.included.length : null,
    excludedByDir: Array.isArray(manifest.excludedByDir) ? manifest.excludedByDir.length : null,
    excludedByContent: Array.isArray(manifest.excludedByContent) ? manifest.excludedByContent.length : null,
  })
  await db.query(`
    INSERT INTO source_batches (
      id, source_name, source_repository, source_commit, manifest_hash, rights_note, metadata
    ) VALUES ($1, 'daizhige', $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      source_repository = EXCLUDED.source_repository,
      source_commit = EXCLUDED.source_commit,
      manifest_hash = EXCLUDED.manifest_hash,
      rights_note = EXCLUDED.rights_note,
      metadata = source_batches.metadata || EXCLUDED.metadata
  `, [
    batch,
    manifest.source?.repository ?? null,
    manifest.source?.commit ?? null,
    manifestHash,
    '非佛道古典文学；来源如实标注 daizhige；权利人异议时立即下架，不作对抗性主张。',
    metadata,
  ])

  const jobResult = await db.query(
    'INSERT INTO import_jobs (source_batch, requested_count) VALUES ($1, $2) RETURNING id',
    [batch, works.length],
  )
  const jobId = jobResult.rows[0].id

  try {
    const importedCount = await db.transaction(async (tx) => {
      const query = buildCatalogUpsert(works)
      const result = await tx.query(query.text, query.params)
      if (result.rows.length !== works.length) {
        throw new Error(`Catalog upsert affected ${result.rows.length}/${works.length} works; possible cross-batch ID collision`)
      }
      return result.rows.length
    })
    await db.query(`
      UPDATE import_jobs
      SET status = 'completed', imported_count = $1, completed_at = now()
      WHERE id = $2
    `, [importedCount, jobId])
    return { jobId, importedCount }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.query(`
      UPDATE import_jobs
      SET status = 'failed', failed_count = requested_count,
          error_summary = jsonb_build_array($1::text), completed_at = now()
      WHERE id = $2
    `, [message, jobId])
    throw error
  }
}

async function connect(url) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { max: 1, prepare: false })
  return {
    query: async (text, params = []) => ({ rows: await sql.unsafe(text, params) }),
    transaction: async (callback) => sql.begin(async (tx) => callback({
      query: async (text, params = []) => ({ rows: await tx.unsafe(text, params) }),
    })),
    close: () => sql.end(),
  }
}

async function main() {
  const args = parseCatalogArgs(process.argv.slice(2))
  const manifestText = await readFile(args.manifest, 'utf8')
  const manifest = JSON.parse(manifestText)
  const manifestHash = sha256(manifestText)
  const works = selectCatalogEntries(manifest, args.offset, args.limit)
  if (!works.length) throw new Error(`No works selected at offset ${args.offset}`)
  const plan = buildCatalogPlan(manifest, manifestHash, works, args.offset)

  if (args.plan) {
    await writeFile(args.plan, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${args.plan}`)
  }
  console.log(JSON.stringify(plan.totals))
  if (args.dryRun || !args.databaseUrl) {
    console.log('Plan-only mode; no database writes performed.')
    return
  }

  const db = await connect(args.databaseUrl)
  try {
    console.log(JSON.stringify(await importCatalogWorks(db, { manifest, manifestHash, works })))
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
