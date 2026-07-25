#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function quote(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

const args = process.argv.slice(2)
const manifestIndex = args.indexOf('--manifest')
const outputIndex = args.indexOf('--out')
const manifestPath = resolve(process.cwd(), manifestIndex >= 0 ? args[manifestIndex + 1] : 'out/content-objects/daizhige-2026-07-11/objects-20.json')
const outputPath = resolve(process.cwd(), outputIndex >= 0 ? args[outputIndex + 1] : 'out/content-objects/daizhige-2026-07-11/update-neon-metadata.sql')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (!Array.isArray(manifest.records) || !manifest.records.length) throw new Error('Object manifest has no records')

const tuples = manifest.records.map((record) => `(${[
  record.id,
  record.batch,
  record.key,
  record.bytes,
  record.objectHash,
  record.passageCount,
].map(quote).join(', ')})`)

const sql = [
  '-- Generated after R2 upload verification. Does not change publication or verification status.',
  'BEGIN;',
  'CREATE TEMP TABLE object_metadata (',
  '  id text, source_batch text, object_key text, object_bytes bigint, object_hash char(64), passage_count integer',
  ') ON COMMIT DROP;',
  `INSERT INTO object_metadata VALUES\n${tuples.join(',\n')};`,
  'UPDATE works w SET',
  '  content_object_key = m.object_key,',
  "  content_encoding = 'gzip',",
  '  content_bytes = m.object_bytes,',
  '  content_object_hash = m.object_hash,',
  '  passage_count = m.passage_count',
  'FROM object_metadata m',
  'WHERE w.id = m.id AND w.source_batch = m.source_batch;',
  'DO $$ BEGIN',
  '  IF (SELECT count(*) FROM works w JOIN object_metadata m ON w.id = m.id AND w.source_batch = m.source_batch) <>',
  `     ${manifest.records.length} THEN RAISE EXCEPTION 'Expected ${manifest.records.length} matching works'; END IF;`,
  'END $$;',
  'SELECT w.id, w.publication_status, w.source_verification, w.content_object_key, w.content_bytes',
  'FROM works w JOIN object_metadata m ON w.id = m.id ORDER BY w.id;',
  'COMMIT;',
  '',
].join('\n')

await writeFile(outputPath, sql, 'utf8')
console.log(`Wrote ${outputPath}`)
console.log(JSON.stringify({ works: manifest.records.length }))
