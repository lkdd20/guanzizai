#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SUTRA_COLUMNS = [
  'id',
  'library',
  'source_verification',
  'source_batch',
  'cbeta_work_id',
  'taisho_vol',
  'no',
  'title_zh',
  'byline',
  'dynasty',
  'canon',
  'category',
  'source_edition',
  'juan_count',
  'char_count',
  'sha256',
  'created_at',
]

const PASSAGE_COLUMNS = [
  'id',
  'sutra_id',
  'juan',
  'pin',
  'seq',
  'original',
  'cbeta_line_ref',
  'char_count',
  'sha256',
]

const TRANSLATION_COLUMNS = [
  'passage_id',
  'lang',
  'model',
  'prompt_version',
  'content',
  'status',
  'source_sha256',
  'reviewer',
  'created_at',
]

function usage() {
  return [
    'Usage: node scripts/import-sutra.mjs <sutra.json> [--out-dir out] [--out out/file.sql]',
    '',
    'Input must be a manually verified sutra JSON. This script does not fetch, OCR,',
    'or generate original scripture text.',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { input: undefined, outDir: 'out', outFile: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--out-dir') {
      args.outDir = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--out') {
      args.outFile = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    if (args.input) throw new Error(`Unexpected extra argument: ${arg}`)
    args.input = arg
  }
  if (!args.input) throw new Error(usage())
  return args
}

function requireValue(argv, index, optionName) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value`)
  return value
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function readableCharCount(text) {
  return Array.from(text).filter((character) => /[\p{Letter}\p{Number}]/u.test(character)).length
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value) {
  if (value === undefined || value === null) return null
  const text = String(value)
  return text.trim() ? text : null
}

function requiredString(value, fieldPath) {
  const text = optionalString(value)
  if (!text) throw new Error(`${fieldPath} is required`)
  return text
}

function optionalInteger(value, fieldPath) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(`${fieldPath} must be an integer`)
  return number
}

function requiredInteger(value, fieldPath) {
  const number = optionalInteger(value, fieldPath)
  if (number === null) throw new Error(`${fieldPath} is required`)
  return number
}

function assertSha(fieldPath, expected, actual) {
  const normalizedActual = requiredString(actual, fieldPath).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalizedActual)) {
    throw new Error(`${fieldPath} must be a 64-character SHA-256 hex digest`)
  }
  if (normalizedActual !== expected) {
    throw new Error(`${fieldPath} mismatch: expected ${expected}, got ${normalizedActual}`)
  }
  return normalizedActual
}

function assertNoForbiddenSourceLabels(sutra) {
  const checkedFields = ['source_edition', 'canon', 'cbeta_work_id']
  for (const field of checkedFields) {
    const value = sutra[field]
    if (typeof value === 'string' && /cbeta|中华电子佛典|中華電子佛典/i.test(value)) {
      throw new Error(`Forbidden source label in sutra.${field}: CBETA data is not authorized for this project`)
    }
  }
}

function normalizeTranslation(rawTranslation, passage, index) {
  if (!isPlainObject(rawTranslation)) {
    throw new Error(`passages[${index}].translation must be an object`)
  }
  const content = optionalString(rawTranslation.content)
  if (!content) return null

  const status = requiredString(rawTranslation.status, `passages[${index}].translation.status`)
  if (!['draft', 'published'].includes(status)) {
    throw new Error(`passages[${index}].translation.status must be "draft" or "published"`)
  }

  return {
    passage_id: passage.id,
    lang: optionalString(rawTranslation.lang) ?? 'zh-Hans',
    model: optionalString(rawTranslation.model),
    prompt_version: optionalString(rawTranslation.prompt_version ?? rawTranslation.promptVersion),
    content,
    status,
    source_sha256: optionalString(rawTranslation.source_sha256 ?? rawTranslation.sourceSha256) ?? passage.sha256,
    reviewer: optionalString(rawTranslation.reviewer),
    created_at: optionalString(rawTranslation.created_at ?? rawTranslation.createdAt) ?? new Date().toISOString(),
  }
}

function normalizePassage(rawPassage, sutraId, index) {
  if (!isPlainObject(rawPassage)) throw new Error(`passages[${index}] must be an object`)

  const original = requiredString(rawPassage.original, `passages[${index}].original`)
  const computedSha = sha256(original)
  const computedCharCount = readableCharCount(original)
  const providedLineRef = optionalString(rawPassage.cbeta_line_ref ?? rawPassage.cbetaLineRef)
  if (providedLineRef) {
    throw new Error(
      `passages[${index}].cbeta_line_ref must be null for current public-domain imports; non-empty value may indicate CBETA-derived data`,
    )
  }

  const providedCharCount = optionalInteger(rawPassage.char_count ?? rawPassage.charCount, `passages[${index}].char_count`)
  if (providedCharCount !== null && providedCharCount !== computedCharCount) {
    throw new Error(
      `passages[${index}].char_count mismatch: expected ${computedCharCount}, got ${providedCharCount}`,
    )
  }

  const passage = {
    id: requiredString(rawPassage.id, `passages[${index}].id`),
    sutra_id: sutraId,
    juan: requiredInteger(rawPassage.juan, `passages[${index}].juan`),
    pin: optionalInteger(rawPassage.pin, `passages[${index}].pin`),
    seq: requiredInteger(rawPassage.seq, `passages[${index}].seq`),
    original,
    cbeta_line_ref: null,
    char_count: computedCharCount,
    sha256: assertSha(`passages[${index}].sha256`, computedSha, rawPassage.sha256),
  }

  const rawTranslations = Array.isArray(rawPassage.translations)
    ? rawPassage.translations
    : rawPassage.translation
      ? [rawPassage.translation]
      : []
  const translations = rawTranslations
    .map((translation) => normalizeTranslation(translation, passage, index))
    .filter(Boolean)

  return { passage, translations }
}

function normalizeImport(rawJson) {
  if (!isPlainObject(rawJson)) throw new Error('Input JSON must be an object')

  const sutraInput = isPlainObject(rawJson.sutra) ? rawJson.sutra : rawJson
  const rawPassages = Array.isArray(rawJson.passages)
    ? rawJson.passages
    : Array.isArray(sutraInput.passages)
      ? sutraInput.passages
      : null
  if (!rawPassages || rawPassages.length === 0) throw new Error('passages must be a non-empty array')

  const sutraId = requiredString(sutraInput.id, 'sutra.id')
  const normalizedPassages = rawPassages.map((passage, index) => normalizePassage(passage, sutraId, index))
  const passages = normalizedPassages.map((item) => item.passage)
  const translations = normalizedPassages.flatMap((item) => item.translations)

  const passageIds = new Set()
  const passageSeqs = new Set()
  for (const passage of passages) {
    if (passageIds.has(passage.id)) throw new Error(`Duplicate passage id: ${passage.id}`)
    passageIds.add(passage.id)
    const seqKey = `${passage.juan}:${passage.seq}`
    if (passageSeqs.has(seqKey)) throw new Error(`Duplicate passage juan/seq: ${seqKey}`)
    passageSeqs.add(seqKey)
  }

  const originalText = passages.map((passage) => passage.original).join('')
  const fullSha = assertSha('sutra.sha256', sha256(originalText), sutraInput.sha256)
  const computedCharCount = passages.reduce((sum, passage) => sum + passage.char_count, 0)
  const providedCharCount = optionalInteger(sutraInput.char_count ?? sutraInput.charCount, 'sutra.char_count')
  if (providedCharCount !== null && providedCharCount !== computedCharCount) {
    throw new Error(`sutra.char_count mismatch: expected ${computedCharCount}, got ${providedCharCount}`)
  }

  const sutra = {
    id: sutraId,
    library: optionalString(sutraInput.library) ?? '佛典',
    source_verification:
      optionalString(sutraInput.source_verification ?? sutraInput.sourceVerification) ?? 'verified',
    source_batch: optionalString(sutraInput.source_batch ?? sutraInput.sourceBatch),
    cbeta_work_id: optionalString(sutraInput.cbeta_work_id ?? sutraInput.cbetaWorkId),
    taisho_vol: optionalString(sutraInput.taisho_vol ?? sutraInput.taishoVol),
    no: optionalString(sutraInput.no),
    title_zh: requiredString(sutraInput.title_zh ?? sutraInput.title, 'sutra.title_zh'),
    byline: optionalString(sutraInput.byline ?? sutraInput.translator),
    dynasty: optionalString(sutraInput.dynasty),
    canon: optionalString(sutraInput.canon),
    category: optionalString(sutraInput.category),
    source_edition: requiredString(sutraInput.source_edition ?? sutraInput.sourceEdition, 'sutra.source_edition'),
    juan_count:
      optionalInteger(sutraInput.juan_count ?? sutraInput.juanCount, 'sutra.juan_count') ??
      Math.max(...passages.map((passage) => passage.juan)),
    char_count: computedCharCount,
    sha256: fullSha,
    created_at: optionalString(sutraInput.created_at ?? sutraInput.createdAt) ?? new Date().toISOString(),
  }

  if (!['佛典', '国学'].includes(sutra.library)) {
    throw new Error('sutra.library must be "佛典" or "国学"')
  }
  if (!['unverified', 'spot_checked', 'verified'].includes(sutra.source_verification)) {
    throw new Error('sutra.source_verification must be "unverified", "spot_checked", or "verified"')
  }

  assertNoForbiddenSourceLabels(sutra)

  return { sutra, passages, translations }
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertOrReplace(tableName, columns, row) {
  const values = columns.map((column) => sqlValue(row[column])).join(', ')
  return `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${values});`
}

function sqlList(values) {
  if (values.length === 0) return '(NULL)'
  return `(${values.map(sqlValue).join(', ')})`
}

function buildSql(importData, inputPath) {
  const { sutra, passages, translations } = importData
  const statements = [
    '-- Generated by scripts/import-sutra.mjs',
    `-- Source JSON: ${inputPath}`,
    '-- Original scripture text must be manually verified before this SQL is executed.',
    'BEGIN TRANSACTION;',
    insertOrReplace('sutras', SUTRA_COLUMNS, sutra),
    `DELETE FROM translations WHERE passage_id IN ${sqlList(passages.map((passage) => passage.id))};`,
    ...passages.map((passage) => insertOrReplace('passages', PASSAGE_COLUMNS, passage)),
    ...translations.map((translation) => insertOrReplace('translations', TRANSLATION_COLUMNS, translation)),
    'COMMIT;',
    '',
  ]
  return statements.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = resolve(process.cwd(), args.input)
  const rawJson = JSON.parse(readFileSync(inputPath, 'utf8'))
  const importData = normalizeImport(rawJson)
  const outputPath = resolve(process.cwd(), args.outFile ?? `${args.outDir}/${importData.sutra.id}.sql`)

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, buildSql(importData, inputPath), 'utf8')

  console.log(`Wrote ${outputPath}`)
  console.log(
    `Prepared ${importData.passages.length} passages and ${importData.translations.length} translations for ${importData.sutra.id}.`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
