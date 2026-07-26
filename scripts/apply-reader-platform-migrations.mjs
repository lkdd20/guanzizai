import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_DIRECT_URL?.trim()
  || process.env.DATABASE_URL_UNPOOLED?.trim()
  || process.env.DATABASE_POSTGRES_URL_NON_POOLING?.trim()
  || process.env.DATABASE_URL?.trim()
const optional = process.argv.includes('--optional')
if (!databaseUrl) {
  if (optional) {
    process.stdout.write('reader platform migrations skipped: no PostgreSQL URL\n')
    process.exit(0)
  }
  throw new Error('A PostgreSQL migration URL is required')
}

const migrations = [
  'postgres/migrations/0006_community_contributions.sql',
  'postgres/migrations/0008_community_contribution_attachments.sql',
  'postgres/migrations/0009_reader_accounts.sql',
  'postgres/migrations/0010_content_revision.sql',
  'postgres/migrations/0011_account_library.sql',
  'postgres/migrations/0012_gold_reader_highlights.sql',
  'postgres/migrations/0013_content_package_provenance.sql',
  'postgres/migrations/0014_term_glossary.sql',
  'postgres/migrations/0015_runtime_model_settings.sql',
  'postgres/migrations/0016_bug_report_contributions.sql',
]
const sql = postgres(databaseUrl, { max: 1, prepare: false })
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationLockKey = 2510012

try {
  await sql`SELECT pg_advisory_lock(${migrationLockKey})`
  try {
    for (const migration of migrations) {
      const source = await readFile(resolve(repositoryRoot, migration), 'utf8')
      await sql.unsafe(source)
      process.stdout.write(`applied ${migration}\n`)
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(${migrationLockKey})`
  }
} finally {
  await sql.end()
}
