#!/usr/bin/env node
import postgres from 'postgres'

const [batch] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const urlArgIndex = process.argv.indexOf('--database-url')
const databaseUrl = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL

if (!batch || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(batch)) {
  throw new Error('Usage: node scripts/rollback-source-batch.mjs <source-batch> [--database-url <url>]')
}
if (!databaseUrl) throw new Error('DATABASE_DIRECT_URL or --database-url is required')

const sql = postgres(databaseUrl, { max: 1, prepare: false })
try {
  const result = await sql.begin(async (tx) => {
    const [{ count }] = await tx`SELECT count(*)::integer AS count FROM works WHERE source_batch = ${batch}`
    await tx`DELETE FROM works WHERE source_batch = ${batch}`
    await tx`UPDATE import_jobs SET status = 'rolled_back', completed_at = now() WHERE source_batch = ${batch}`
    await tx`UPDATE source_batches SET rolled_back_at = now() WHERE id = ${batch}`
    return { batch, deletedWorks: Number(count) }
  })
  console.log(JSON.stringify(result))
} finally {
  await sql.end()
}
