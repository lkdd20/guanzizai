#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const gzipAsync = promisify(gzip)

function usage() {
  return [
    'Usage: node scripts/package-upload-content-objects.mjs [options]',
    '',
    '  --input <dir>       Batch JSON directory',
    '  --qa <file>         QA sample list used for deterministic ordering',
    '  --batch <id>        Source batch',
    '  --limit <n>         Number of works (default: 20, max: 500)',
    '  --offset <n>        Skip this many QA-ordered works (default: 0)',
    '  --output <dir>      Local gzip output directory',
    '  --upload            Upload to R2 after packaging',
    '  --database-url <u>  Update object metadata after successful upload',
  ].join('\n')
}

function parseArgs(argv) {
  const args = {
    input: 'out/daizhige-2026-07-11/json',
    qa: 'out/daizhige-2026-07-11/qa-sample-list.json',
    batch: 'daizhige-2026-07-11',
    limit: 20,
    offset: 0,
    output: 'out/content-objects',
    upload: false,
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--upload') {
      args.upload = true
      continue
    }
    const key = {
      '--input': 'input', '--qa': 'qa', '--batch': 'batch', '--limit': 'limit', '--offset': 'offset',
      '--output': 'output', '--database-url': 'databaseUrl',
    }[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = ['limit', 'offset'].includes(key) ? Number(value) : value
    index += 1
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) throw new Error('--limit must be 1-500')
  if (!Number.isInteger(args.offset) || args.offset < 0) throw new Error('--offset must be a non-negative integer')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(args.batch)) throw new Error('Invalid --batch')
  args.input = resolve(process.cwd(), args.input)
  args.qa = resolve(process.cwd(), args.qa)
  args.output = resolve(process.cwd(), args.output)
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const bucket = process.env.R2_CONTENT_BUCKET?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID, R2_CONTENT_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required')
  }
  return { accountId, bucket, accessKeyId, secretAccessKey }
}

async function selectedIds(qaPath, offset, limit) {
  const qa = JSON.parse(await readFile(qaPath, 'utf8'))
  const ids = []
  const seen = new Set()
  for (const entry of [...qa.fullReview, ...qa.spotCheck]) {
    if (!seen.has(entry.id)) {
      ids.push(entry.id)
      seen.add(entry.id)
    }
  }
  const selected = ids.slice(offset, offset + limit)
  if (selected.length !== limit) throw new Error(`Only ${selected.length} works available from offset ${offset}`)
  return selected
}

function contentObject(work) {
  return {
    format: 'guanzizai-work-v1',
    id: work.sutra.id,
    sourceBatch: work.sutra.source_batch,
    contentHash: work.sutra.sha256,
    passages: work.passages.map((passage) => ({
      id: passage.id,
      juan: passage.juan,
      sequence: passage.seq,
      original: passage.original,
      contentHash: passage.sha256,
      characterCount: passage.char_count,
    })),
  }
}

async function uploadObject(config, key, body, metadata) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
    Metadata: metadata,
  }))
}

async function updateDatabase(url, record) {
  if (!url) return
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { max: 1, prepare: false })
  try {
    const rows = await sql`
      UPDATE works SET
        content_object_key = ${record.key},
        content_encoding = 'gzip',
        content_bytes = ${record.bytes},
        content_object_hash = ${record.objectHash},
        passage_count = ${record.passageCount}
      WHERE id = ${record.id} AND source_batch = ${record.batch}
      RETURNING id
    `
    if (rows.length !== 1) throw new Error(`Database work not found for uploaded object: ${record.id}`)
  } finally {
    await sql.end()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ids = await selectedIds(args.qa, args.offset, args.limit)
  const config = args.upload ? r2Config() : null
  const records = []

  for (const id of ids) {
    const work = JSON.parse(await readFile(join(args.input, `${id}.json`), 'utf8'))
    if (work.sutra.source_batch !== args.batch) throw new Error(`Batch mismatch: ${id}`)
    const payload = Buffer.from(JSON.stringify(contentObject(work)), 'utf8')
    const compressed = await gzipAsync(payload, { level: 9 })
    const objectHash = sha256(compressed)
    const key = `works/${args.batch}/${id}.json.gz`
    const localPath = join(args.output, key)
    await mkdir(dirname(localPath), { recursive: true })
    await writeFile(localPath, compressed)

    const record = {
      id,
      batch: args.batch,
      key,
      bytes: compressed.byteLength,
      uncompressedBytes: payload.byteLength,
      objectHash,
      contentHash: work.sutra.sha256,
      passageCount: work.passages.length,
      uploaded: false,
    }
    if (config) {
      await uploadObject(config, key, compressed, {
        'work-id': id,
        'source-batch': args.batch,
        'content-hash': work.sutra.sha256,
        'object-hash': objectHash,
      })
      record.uploaded = true
      await updateDatabase(args.databaseUrl, record)
    }
    records.push(record)
  }

  const manifestPath = join(args.output, args.batch, `objects-${args.offset}-${args.limit}.json`)
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), offset: args.offset, limit: args.limit, records }, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${manifestPath}`)
  console.log(JSON.stringify({ works: records.length, bytes: records.reduce((sum, item) => sum + item.bytes, 0), uploaded: records.filter((item) => item.uploaded).length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
