#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { buildWorkTermIndex, canonicalTermKey } from './lib/term-index.mjs'

const expectedDatasetId = 'buddhist-canon-core'
const defaultChunkSize = 250
const postgresParameterLimit = 65535

function usage() {
  return [
    'Usage: node scripts/import-buddhist-canon-package.mjs --input <extracted-package> [options]',
    '',
    '  --input <dir>                 Extracted buddhist-canon-core directory',
    '  --zip <file>                  Original ZIP to verify before import',
    '  --expected-zip-sha256 <hash>  Required hash when --zip is supplied',
    '  --database-url <url>          PostgreSQL direct URL',
    '  --pglite <path>               Local PGlite development database',
    '  --dry-run                     Validate and write a plan only',
    '  --plan <file>                 Plan output path',
    `  --chunk-size <n>              Multi-row insert size (default: ${defaultChunkSize})`,
  ].join('\n')
}

function parseArgs(argv) {
  const args = {
    input: '',
    zip: '',
    expectedZipSha256: '',
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim() || '',
    pglite: '',
    dryRun: false,
    plan: 'out/buddhist-canon-core-import-plan.json',
    chunkSize: defaultChunkSize,
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
      '--input': 'input',
      '--zip': 'zip',
      '--expected-zip-sha256': 'expectedZipSha256',
      '--database-url': 'databaseUrl',
      '--pglite': 'pglite',
      '--plan': 'plan',
      '--chunk-size': 'chunkSize',
    }[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'chunkSize' ? Number(value) : value
    index += 1
  }
  if (!args.input) throw new Error('--input is required')
  if (args.databaseUrl && args.pglite) throw new Error('Use either --database-url or --pglite, not both')
  if (args.zip && !/^[a-f0-9]{64}$/i.test(args.expectedZipSha256)) {
    throw new Error('--expected-zip-sha256 is required with --zip')
  }
  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1 || args.chunkSize > 1000) {
    throw new Error('--chunk-size must be an integer from 1 to 1000')
  }
  for (const key of ['input', 'zip', 'pglite', 'plan']) {
    if (args[key]) args[key] = resolve(process.cwd(), args[key])
  }
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function hashFile(path) {
  return sha256(await readFile(path))
}

function hanCount(value) {
  return value.match(/\p{Script=Han}/gu)?.length ?? 0
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function json(value) {
  return JSON.stringify(value ?? null)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function verifyChecksums(root, checksumsFile) {
  const lines = (await readFile(checksumsFile, 'utf8')).split(/\r?\n/).filter(Boolean)
  const checked = []
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    assert(match, `Invalid checksum line: ${line}`)
    const path = resolve(root, match[2])
    assert(path.startsWith(`${root}/`), `Checksum path escapes package root: ${match[2]}`)
    assert((await stat(path)).isFile(), `Checksum target is not a file: ${match[2]}`)
    const actual = await hashFile(path)
    assert(actual === match[1].toLowerCase(), `Checksum mismatch: ${match[2]}`)
    checked.push(match[2])
  }
  return checked
}

function stableWorkId(packageWorkId) {
  return `bcc-ws-${packageWorkId}`
}

function validateManifest(manifest) {
  assert(manifest.dataset_id === expectedDatasetId, `Unexpected dataset: ${manifest.dataset_id}`)
  assert(manifest.dataset_version === '1.1.0', `Unsupported dataset version: ${manifest.dataset_version}`)
  assert(manifest.record_count === 112, 'Manifest must contain 112 records')
  assert(manifest.work_count === 5, 'Manifest must contain 5 works')
  assert(manifest.source_page_count === 133, 'Manifest must contain 133 fixed source pages')
  assert(manifest.translation_segment_count === 27395, 'Manifest translation segment count mismatch')
  assert(manifest.source_han_characters === 1050942, 'Manifest source character count mismatch')
  assert(manifest.source_lineage?.cbeta_content_used === false, 'CBETA lineage is forbidden')
  assert(manifest.source_lineage?.prior_package_source_text_reused === false, 'Prior package source text reuse is forbidden')
  assert(manifest.source_lineage?.prior_package_translation_reused === false, 'Prior package translation reuse is forbidden')
  assert(manifest.import_policy?.import_ready === true, 'Package is not import ready')
  assert(manifest.import_policy?.publication_ready === false, 'Package must not be publication ready')
  assert(manifest.import_policy?.content_visibility === 'hidden', 'Package visibility must be hidden')
  assert(manifest.import_policy?.translation_status === 'machine_draft', 'Package translations must be machine drafts')
  assert(manifest.import_policy?.delete_old_records === false, 'Package must not delete old records')
  assert(manifest.license_profile?.commercial_use_allowed === true, 'Package does not permit commercial use')
  assert(manifest.license_profile?.attribution_required === true, 'Attribution requirement is missing')
  assert(manifest.license_profile?.share_alike_required === true, 'ShareAlike requirement is missing')
}

function validateRecord(record, recordIds, segmentIds) {
  assert(!recordIds.has(record.id), `Duplicate record id: ${record.id}`)
  recordIds.add(record.id)
  assert(record.source_lineage?.cbeta_content_used === false, `${record.id}: CBETA lineage is forbidden`)
  assert(record.source_lineage?.prior_package_source_text_reused === false, `${record.id}: old source text was reused`)
  assert(record.source_lineage?.prior_package_translation_reused === false, `${record.id}: old translation was reused`)
  assert(record.publication?.content_visibility === 'hidden', `${record.id}: visibility must be hidden`)
  assert(record.publication?.publication_ready === false, `${record.id}: must not be publication ready`)
  assert(record.text?.original_traditional, `${record.id}: traditional source is empty`)
  assert(sha256(record.text.original_traditional) === record.text.original_sha256, `${record.id}: original hash mismatch`)
  assert(hanCount(record.text.original_traditional) === record.text.han_character_count_traditional,
    `${record.id}: source Han character count mismatch`)
  assert(record.text.original_simplified, `${record.id}: simplified source is empty`)
  assert(record.text.original_simplified_pinyin, `${record.id}: pinyin is empty`)
  assert(record.translation?.status === 'machine_draft', `${record.id}: aggregate translation is not draft`)
  assert(record.translation?.human_reviewed !== true, `${record.id}: aggregate translation review state is invalid`)
  assert(record.primary_source?.platform === '中文维基文库', `${record.id}: unexpected primary platform`)
  assert(String(record.primary_source?.license ?? '').includes('CC BY-SA 4.0'), `${record.id}: source license is incomplete`)
  assert(record.rights?.commercial_use_allowed === true, `${record.id}: commercial reuse is not allowed`)
  assert(record.rights?.attribution_required === true, `${record.id}: attribution flag is missing`)
  assert(record.rights?.share_alike_required === true, `${record.id}: ShareAlike flag is missing`)

  let segmentHanCharacters = 0
  for (const segment of record.translation_segments ?? []) {
    assert(!segmentIds.has(segment.segment_id), `Duplicate segment id: ${segment.segment_id}`)
    segmentIds.add(segment.segment_id)
    assert(segment.translation_status === 'machine_draft', `${segment.segment_id}: translation is not draft`)
    assert(sha256(segment.source_text) === segment.source_sha256, `${segment.segment_id}: source hash mismatch`)
    assert(sha256(segment.translation_simplified) === segment.translation_sha256,
      `${segment.segment_id}: translation hash mismatch`)
    assert(record.text.original_traditional.slice(segment.source_start, segment.source_end) === segment.source_text,
      `${segment.segment_id}: source offsets do not match the record`)
    segmentHanCharacters += hanCount(segment.source_text)
  }
  assert(segmentHanCharacters === record.text.han_character_count_traditional,
    `${record.id}: segments do not cover all source Han characters`)
  for (const note of record.reading_notes ?? []) {
    assert(note.status === 'machine_draft', `${note.note_id}: reading note is not draft`)
    assert(segmentIds.has(note.segment_id), `${note.note_id}: reading note references a missing segment`)
  }
}

function isReadingHeading(value) {
  const text = value.trim().replace(/^;/u, '')
  if (!text || hanCount(text) > 18) return false
  if (value.trimStart().startsWith(';')) return true
  if (/[。！？；，、,.!?]$/u.test(text)) return false
  const titleText = text.replace(/[：:]$/u, '')
  return /(?:讚|赞|偈|真言|陀羅尼|陀罗尼|呪|咒|序|正文|品第[一二三四五六七八九十百千0-9]+|第[一二三四五六七八九十百千0-9]+品|經卷|经卷)$/u.test(titleText)
}

function normalizedTitle(value) {
  return value.replace(/^;/u, '').replace(/[《》〈〉\s：:，,。！？；;、]/gu, '')
}

function isWikisourceReadingArtifact(record, segment, index) {
  const text = segment.source_text.trim()
  if (/^(?:Category|分類|分类)\s*:/iu.test(text)) return true
  const hasCategoryArtifact = record.translation_segments.some((item) => /^(?:Category|分類|分类)\s*:/iu.test(item.source_text.trim()))
  const isTrailingSegment = index === record.translation_segments.length - 1
  if ((!hasCategoryArtifact && !isTrailingSegment) || index === 0) return false
  const workTitle = normalizedTitle(
    record.work?.title_traditional || record.work?.title_simplified || record.primary_source?.page_title || '',
  )
  const candidate = normalizedTitle(text).replace(/卷第?[一二三四五六七八九十百千0-9]+$/u, '')
  return Boolean(workTitle) && candidate === workTitle
}

export function groupRecordSegments(record) {
  const groups = []
  let current = []
  let currentCharacters = 0
  const translationSegments = record.translation_segments.filter((segment, index) => !isWikisourceReadingArtifact(record, segment, index))
  const flush = () => {
    if (current.length) groups.push(current)
    current = []
    currentCharacters = 0
  }

  translationSegments.forEach((segment, index) => {
    const segmentCharacters = hanCount(segment.source_text)
    const previous = translationSegments[index - 1]
    const gapBefore = previous
      ? record.text.original_traditional.slice(previous.source_end, segment.source_start)
      : ''
    if (isReadingHeading(segment.source_text)) {
      flush()
      current.push(segment)
      currentCharacters = segmentCharacters
      return
    }
    const startsWithHeading = current.length === 1 && isReadingHeading(current[0].source_text)
    if (
      current.length
      && !startsWithHeading
      && (
        currentCharacters + segmentCharacters > 180
        || currentCharacters >= 140
        || (/\n\s*\n/u.test(gapBefore) && currentCharacters >= 48)
      )
    ) flush()
    current.push(segment)
    currentCharacters += segmentCharacters
    const next = translationSegments[index + 1]
    const gapAfter = next
      ? record.text.original_traditional.slice(segment.source_end, next.source_start)
      : ''
    if (currentCharacters >= 96 && (/[。！？；]$/u.test(segment.source_text.trim()) || /\n\s*\n/u.test(gapAfter))) flush()
  })
  flush()
  return groups
}

function buildWorkModels(manifest, records) {
  const recordsByWork = new Map()
  for (const record of records) {
    const values = recordsByWork.get(record.work_id) ?? []
    values.push(record)
    recordsByWork.set(record.work_id, values)
  }
  return manifest.works.map((manifestWork) => {
    const workRecords = [...(recordsByWork.get(manifestWork.work_id) ?? [])]
      .sort((a, b) => a.ordering.local_index - b.ordering.local_index)
    assert(workRecords.length === manifestWork.record_count, `${manifestWork.work_id}: record count mismatch`)
    let sequence = 1
    const sections = []
    const passages = []
    for (const record of workRecords) {
      const firstSequence = sequence
      const firstPassageIndex = passages.length
      const pinyinTokens = record.text.original_simplified_pinyin.match(/\p{Script=Latin}+/gu) ?? []
      const recordPinyinAligned = pinyinTokens.length === record.text.han_character_count_traditional
      const segmentGroups = groupRecordSegments(record)
      for (const [groupIndex, segments] of segmentGroups.entries()) {
        const firstSegment = segments[0]
        const lastSegment = segments.at(-1)
        const originalText = record.text.original_traditional.slice(firstSegment.source_start, lastSegment.source_end)
        const passageHanCount = hanCount(originalText)
        const passageHanOffset = hanCount(record.text.original_traditional.slice(0, firstSegment.source_start))
        const translationText = segments.map((segment) => segment.translation_simplified).join('\n\n')
        const segmentIds = new Set(segments.map((segment) => segment.segment_id))
        passages.push({
          id: `${record.id}-passage-${String(groupIndex + 1).padStart(4, '0')}`,
          recordId: record.id,
          sequence,
          originalText,
          contentHash: sha256(originalText),
          characterCount: passageHanCount,
          translation: {
            translation_simplified: translationText,
            translation_sha256: sha256(translationText),
            quality_flags: [...new Set(segments.flatMap((segment) => segment.quality_flags ?? []))],
            source_basis: 'original_traditional',
            source_start: firstSegment.source_start,
            source_end: lastSegment.source_end,
          },
          segments,
          sourceUrl: record.primary_source.url,
          recordQuality: record.quality,
          sourceRecord: record,
          pinyin: recordPinyinAligned
            ? pinyinTokens.slice(passageHanOffset, passageHanOffset + passageHanCount).join(' ')
            : '',
          pinyinStatus: recordPinyinAligned ? 'automatic_machine_draft' : 'automatic_alignment_unavailable',
          readingNotes: (record.reading_notes ?? []).filter((note) => segmentIds.has(note.segment_id)),
        })
        sequence += 1
      }
      const recordReadingCharacterCount = passages
        .slice(firstPassageIndex)
        .reduce((sum, passage) => sum + passage.characterCount, 0)
      sections.push({
        key: record.id,
        title: record.title.traditional,
        juan: record.ordering.local_index,
        sequence: firstSequence,
        endSequence: sequence - 1,
        contentHash: record.text.original_sha256,
        characterCount: recordReadingCharacterCount,
        record,
      })
    }
    const firstRecord = workRecords[0]
    const termIndex = buildWorkTermIndex({
      notes: workRecords.flatMap((record) => record.reading_notes ?? []),
      passages,
    })
    for (const passage of passages) passage.readingNotes = termIndex.notesByPassage.get(passage.id) ?? []
    return {
      id: stableWorkId(manifestWork.work_id),
      packageWorkId: manifestWork.work_id,
      title: manifestWork.title_simplified,
      author: firstRecord.work.historical_translator || firstRecord.work.author_attribution || null,
      dynasty: firstRecord.work.dynasty_or_period || null,
      category: firstRecord.work.canon_category || '佛典',
      sourceEdition: `${manifestWork.primary_edition}；页面贡献与编排按 CC BY-SA 4.0，本站进行了结构化分段和 AI 派生字段整理`,
      sourcePath: firstRecord.primary_source.url,
      contentHash: sha256(workRecords.map((record) => record.text.original_sha256).join('\n')),
      characterCount: sections.reduce((sum, section) => sum + section.characterCount, 0),
      records: workRecords,
      sections,
      passages,
      termIndex,
    }
  })
}

export async function loadBuddhistCanonPackage(input, options = {}) {
  const root = resolve(input)
  const manifestPath = join(root, 'manifest.json')
  const manifestText = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestText)
  validateManifest(manifest)
  if (options.zip) {
    const actual = await hashFile(options.zip)
    assert(actual === options.expectedZipSha256.toLowerCase(), 'ZIP SHA-256 mismatch')
  }
  const checkedFiles = await verifyChecksums(root, join(root, manifest.checksums_file))
  const records = []
  const recordIds = new Set()
  const segmentIds = new Set()
  for (const shard of manifest.record_shards) {
    assert(await hashFile(join(root, shard.path)) === shard.sha256, `Manifest shard hash mismatch: ${shard.path}`)
    const record = JSON.parse(await readFile(join(root, shard.path), 'utf8'))
    validateRecord(record, recordIds, segmentIds)
    records.push(record)
  }
  const replacementMap = JSON.parse(await readFile(join(root, manifest.import_policy.replacement_mapping_file), 'utf8'))
  assert(replacementMap.delete_old_records === false, 'Replacement map attempts to delete old records')
  assert(replacementMap.entries.length === manifest.record_count, 'Replacement map count mismatch')
  const replacementRecordIds = new Set(replacementMap.entries.map((entry) => entry.new_record_id))
  assert(records.every((record) => replacementRecordIds.has(record.id)), 'Replacement map does not cover every record')
  const works = buildWorkModels(manifest, records)
  const primarySourceComponents = records.reduce(
    (sum, record) => sum + (record.primary_source.source_components?.length || 1), 0,
  )
  const noteCount = records.reduce((sum, record) => sum + (record.reading_notes?.length ?? 0), 0)
  const totals = {
    works: works.length,
    records: records.length,
    passages: works.reduce((sum, work) => sum + work.passages.length, 0),
    translations: works.reduce((sum, work) => sum + work.passages.length, 0),
    enrichments: works.reduce((sum, work) => sum + work.passages.length, 0),
    translationSegments: records.reduce((sum, record) => sum + record.translation_segments.length, 0),
    readingTranslationSegments: works.reduce(
      (sum, work) => sum + work.passages.reduce((passageSum, passage) => passageSum + passage.segments.length, 0), 0,
    ),
    primarySourceComponents,
    notes: noteCount,
    readingNotes: works.reduce(
      (sum, work) => sum + work.passages.reduce((passageSum, passage) => passageSum + passage.readingNotes.length, 0), 0,
    ),
    uniqueTermDefinitions: works.reduce((sum, work) => sum + work.termIndex.definitions.length, 0),
    termMentions: works.reduce((sum, work) => sum + work.termIndex.mentions.length, 0),
    termCoveredPassages: works.reduce((sum, work) => sum + work.termIndex.metrics.coveredPassages, 0),
    duplicateSourceNotes: works.reduce((sum, work) => sum + work.termIndex.metrics.duplicateSourceNotes, 0),
    sourceHanCharacters: records.reduce((sum, record) => sum + record.text.han_character_count_traditional, 0),
    readingHanCharacters: works.reduce((sum, work) => sum + work.characterCount, 0),
    checkedFiles: checkedFiles.length,
  }
  assert(totals.translationSegments === manifest.translation_segment_count, 'Translation segment total mismatch')
  assert(totals.primarySourceComponents === manifest.source_page_count, 'Fixed source page total mismatch')
  assert(totals.notes === 1344, 'Reading note total mismatch')
  assert(totals.sourceHanCharacters === manifest.source_han_characters, 'Source character total mismatch')
  return {
    root,
    batchId: `${manifest.dataset_id}-open-source-v${manifest.dataset_version}`,
    manifest,
    manifestHash: sha256(manifestText),
    attributionText: await readFile(join(root, 'ATTRIBUTION.md'), 'utf8'),
    licenseText: await readFile(join(root, 'SOURCES_AND_LICENSE.md'), 'utf8'),
    replacementMap,
    works,
    totals,
  }
}

function buildPlan(packageData) {
  return {
    generatedAt: new Date().toISOString(),
    sourceBatch: packageData.batchId,
    datasetVersion: packageData.manifest.dataset_version,
    manifestHash: packageData.manifestHash,
    forcedState: {
      library: '佛典',
      sourceVerification: 'unverified',
      publicationStatus: 'hidden',
      translationStatus: 'draft',
      deleteOldRecords: false,
    },
    totals: packageData.totals,
    works: packageData.works.map((work) => ({
      id: work.id,
      title: work.title,
      records: work.records.length,
      passages: work.passages.length,
      characters: work.characterCount,
      contentHash: work.contentHash,
    })),
  }
}

async function insertRows(tx, table, columns, rows, chunkSize, jsonColumns = []) {
  if (!rows.length) return
  const jsonColumnSet = new Set(jsonColumns)
  const maximumChunkSize = Math.floor(postgresParameterLimit / columns.length)
  for (const batch of chunks(rows, Math.min(chunkSize, maximumChunkSize))) {
    const params = []
    const values = batch.map((row, rowIndex) => {
      const offset = rowIndex * columns.length
      params.push(...columns.map((column) => row[column]))
      return `(${columns.map((column, columnIndex) => {
        const placeholder = `$${offset + columnIndex + 1}`
        return jsonColumnSet.has(column) ? `${placeholder}::text::jsonb` : placeholder
      }).join(',')})`
    })
    await tx.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`, params)
  }
}

function sourceRowsForRecord(record) {
  const primary = record.primary_source
  const components = primary.source_components?.length ? primary.source_components : [primary]
  const primaryRows = components.map((component, componentIndex) => ({
    record_id: record.id,
    source_id: primary.source_id,
    component_index: componentIndex,
    role: 'primary',
    platform: primary.platform,
    institution: primary.institution ?? null,
    source_tier: primary.source_tier ?? null,
    page_title: component.page_title ?? primary.page_title,
    page_id: component.page_id ?? null,
    revision_id: String(component.revision_id ?? primary.revision_id),
    parent_revision_id: component.parent_revision_id ? String(component.parent_revision_id) : null,
    revision_timestamp: component.revision_timestamp ?? null,
    revision_sha1: component.revision_sha1 ?? null,
    persistent_identifier: primary.persistent_identifier ?? null,
    url: component.url ?? primary.url,
    edition: primary.edition ?? null,
    retrieved_at: component.retrieved_at ?? primary.retrieved_at ?? null,
    license: primary.license,
    license_url: primary.license_url ?? null,
    normalized_text_hash: component.normalized_text_sha256 ?? null,
    normalized_han_character_count: component.normalized_han_character_count ?? null,
    metadata: json({ primary, component }),
    imported_at: new Date(),
  }))
  const crossCheckRows = (record.cross_check_sources ?? []).map((source, componentIndex) => ({
    record_id: record.id,
    source_id: source.source_id,
    component_index: componentIndex,
    role: 'cross_check',
    platform: source.platform,
    institution: source.institution ?? null,
    source_tier: source.source_tier ?? null,
    page_title: source.edition || source.platform,
    page_id: null,
    revision_id: String(source.revision_id ?? 'not-recorded'),
    parent_revision_id: null,
    revision_timestamp: null,
    revision_sha1: null,
    persistent_identifier: null,
    url: source.url,
    edition: source.edition ?? null,
    retrieved_at: null,
    license: '仅用于目录或字段交叉核对，不复制其正文',
    license_url: null,
    normalized_text_hash: null,
    normalized_han_character_count: null,
    metadata: json(source),
    imported_at: new Date(),
  }))
  return [...primaryRows, ...crossCheckRows]
}

export async function importBuddhistCanonPackage(db, packageData, options = {}) {
  const chunkSize = options.chunkSize ?? defaultChunkSize
  assert(Number.isInteger(chunkSize) && chunkSize > 0 && chunkSize <= 1000, 'Invalid chunk size')
  return db.transaction(async (tx) => {
    await tx.query(`
      INSERT INTO source_batches (
        id,source_name,source_repository,source_commit,manifest_hash,rights_note,
        metadata,attribution_text,license_text,rolled_back_at
      ) VALUES ($1,$2,$3,NULL,$4,$5,$6::text::jsonb,$7,$8,NULL)
      ON CONFLICT (id) DO UPDATE SET
        source_name=EXCLUDED.source_name,source_repository=EXCLUDED.source_repository,
        manifest_hash=EXCLUDED.manifest_hash,rights_note=EXCLUDED.rights_note,
        metadata=EXCLUDED.metadata,attribution_text=EXCLUDED.attribution_text,
        license_text=EXCLUDED.license_text,rolled_back_at=NULL
    `, [
      packageData.batchId,
      '中文维基文库固定修订',
      'https://zh.wikisource.org',
      packageData.manifestHash,
      '古代作品为公有领域；维基文库页面贡献与编排采用 CC BY-SA 4.0，须署名、注明修改并以相同许可分享。',
      json(packageData.manifest),
      packageData.attributionText,
      packageData.licenseText,
    ])
    const jobResult = await tx.query(
      'INSERT INTO import_jobs (source_batch,requested_count) VALUES ($1,$2) RETURNING id',
      [packageData.batchId, packageData.works.length],
    )
    const jobId = jobResult.rows[0].id

    for (const work of packageData.works) {
      const collision = await tx.query('SELECT source_batch FROM works WHERE id=$1 FOR UPDATE', [work.id])
      if (collision.rows[0] && collision.rows[0].source_batch !== packageData.batchId) {
        throw new Error(`${work.id}: existing work belongs to another source batch`)
      }
      await tx.query(`
        INSERT INTO works (
          id,library,source_batch,source_verification,publication_status,source_edition,source_path,
          title,author,dynasty,category,content_hash,character_count,passage_count,reading_start_sequence,
          content_object_key,content_encoding,content_bytes,content_object_hash,imported_at,published_at
        ) VALUES ($1,'佛典',$2,'unverified','hidden',$3,$4,$5,$6,$7,$8,$9,$10,$11,0,NULL,NULL,NULL,NULL,now(),NULL)
        ON CONFLICT (id) DO UPDATE SET
          library='佛典',source_batch=EXCLUDED.source_batch,source_verification='unverified',
          publication_status='hidden',source_edition=EXCLUDED.source_edition,source_path=EXCLUDED.source_path,
          title=EXCLUDED.title,author=EXCLUDED.author,dynasty=EXCLUDED.dynasty,category=EXCLUDED.category,
          content_hash=EXCLUDED.content_hash,character_count=EXCLUDED.character_count,
          passage_count=EXCLUDED.passage_count,reading_start_sequence=0,content_object_key=NULL,
          content_encoding=NULL,content_bytes=NULL,content_object_hash=NULL,imported_at=now(),published_at=NULL
      `, [
        work.id, packageData.batchId, work.sourceEdition, work.sourcePath, work.title, work.author,
        work.dynasty, work.category, work.contentHash, work.characterCount, work.passages.length,
      ])
      await tx.query('DELETE FROM work_sections WHERE work_id=$1', [work.id])
      const sectionIds = new Map()
      for (const section of work.sections) {
        const result = await tx.query(`
          INSERT INTO work_sections (
            work_id,section_key,title,juan,sequence,kind,level,parent_section_key,
            end_sequence,content_hash,character_count
          ) VALUES ($1,$2,$3,$4,$5,'volume',1,NULL,$6,$7,$8) RETURNING id
        `, [
          work.id, section.key, section.title, section.juan, section.sequence,
          section.endSequence, section.contentHash, section.characterCount,
        ])
        sectionIds.set(section.key, result.rows[0].id)
      }

      const recordRows = work.sections.map((section) => {
        const record = section.record
        const packageMetadata = { work: record.work, title: record.title, ordering: record.ordering,
          content_unit_type: record.content_unit_type, cross_check_sources: record.cross_check_sources,
          review_evidence: record.review_evidence, translation: record.translation }
        return {
          id: record.id,
          work_id: work.id,
          section_id: sectionIds.get(section.key),
          source_batch: packageData.batchId,
          local_index: record.ordering.local_index,
          global_index: record.ordering.global_index,
          title_traditional: record.title.traditional,
          title_simplified: record.title.simplified,
          title_pinyin: record.title.pinyin ?? '',
          title_is_original: Boolean(record.title.is_original),
          hierarchy_path: json(record.hierarchy_path ?? []),
          original_traditional: record.text.original_traditional,
          original_simplified: record.text.original_simplified,
          original_simplified_pinyin: record.text.original_simplified_pinyin,
          project_punctuated_traditional: record.text.project_punctuated_traditional ?? null,
          source_han_character_count: record.text.han_character_count_traditional,
          original_hash: record.text.original_sha256,
          source_snapshot_hash: record.text.source_snapshot_sha256,
          summary: record.summary ?? '',
          keywords: json(record.keywords ?? []),
          reading_notes: json(record.reading_notes ?? []),
          allusions: json(record.allusions ?? []),
          textual_variants: json(record.textual_variants ?? []),
          entities: json(record.entities ?? []),
          categories: json(record.categories ?? []),
          cross_references: json(record.cross_references ?? []),
          quality: json(record.quality ?? {}),
          rights: json(record.rights ?? {}),
          source_lineage: json(record.source_lineage ?? {}),
          publication_metadata: json(record.publication ?? {}),
          package_metadata: json(packageMetadata),
          imported_at: new Date(),
        }
      })
      const recordColumns = [
        'id','work_id','section_id','source_batch','local_index','global_index','title_traditional',
        'title_simplified','title_pinyin','title_is_original','hierarchy_path','original_traditional',
        'original_simplified','original_simplified_pinyin','project_punctuated_traditional',
        'source_han_character_count','original_hash','source_snapshot_hash','summary','keywords',
        'reading_notes','allusions','textual_variants','entities','categories','cross_references','quality',
        'rights','source_lineage','publication_metadata','package_metadata','imported_at',
      ]
      await insertRows(tx, 'content_records', recordColumns, recordRows, chunkSize, [
        'hierarchy_path','keywords','reading_notes','allusions','textual_variants','entities','categories',
        'cross_references','quality','rights','source_lineage','publication_metadata','package_metadata',
      ])

      const sourceRows = work.records.flatMap(sourceRowsForRecord)
      await insertRows(tx, 'content_sources', [
        'record_id','source_id','component_index','role','platform','institution','source_tier','page_title',
        'page_id','revision_id','parent_revision_id','revision_timestamp','revision_sha1','persistent_identifier',
        'url','edition','retrieved_at','license','license_url','normalized_text_hash',
        'normalized_han_character_count','metadata','imported_at',
      ], sourceRows, chunkSize, ['metadata'])

      const passageRows = work.passages.map((passage) => ({
        id: passage.id,
        work_id: work.id,
        section_id: sectionIds.get(passage.recordId),
        sequence: passage.sequence,
        original_text: passage.originalText,
        content_hash: passage.contentHash,
        character_count: passage.characterCount,
        imported_at: new Date(),
      }))
      await insertRows(tx, 'passages', [
        'id','work_id','section_id','sequence','original_text','content_hash','character_count','imported_at',
      ], passageRows, chunkSize)

      const definitionIds = new Map()
      const resolvedDefinitions = new Map()
      for (const definition of work.termIndex.definitions) {
        const glossaryResult = await tx.query(`
          INSERT INTO glossary_terms (
            canonical_key,term_traditional,term_simplified,pinyin,sanskrit_or_other_form,created_at,updated_at
          ) VALUES ($1,$2,$3,$4,$5,now(),now())
          ON CONFLICT (canonical_key) DO UPDATE SET
            term_traditional=CASE WHEN glossary_terms.term_traditional='' THEN EXCLUDED.term_traditional ELSE glossary_terms.term_traditional END,
            term_simplified=CASE WHEN glossary_terms.term_simplified='' THEN EXCLUDED.term_simplified ELSE glossary_terms.term_simplified END,
            pinyin=COALESCE(NULLIF(glossary_terms.pinyin,''),EXCLUDED.pinyin),
            sanskrit_or_other_form=COALESCE(NULLIF(glossary_terms.sanskrit_or_other_form,''),EXCLUDED.sanskrit_or_other_form),
            updated_at=now()
          RETURNING id
        `, [
          definition.canonicalKey, definition.termTraditional, definition.termSimplified,
          definition.pinyin || null, definition.sanskritOrOtherForm || null,
        ])
        const termId = glossaryResult.rows[0].id
        const definitionResult = await tx.query(`
          INSERT INTO work_term_definitions (
            work_id,term_id,explanation,category,source_label,confidence,review_status,
            source_note_count,source_variants,auto_propagation_enabled,created_at,updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text::jsonb,$10,now(),now())
          ON CONFLICT (work_id,term_id) DO UPDATE SET
            explanation=CASE WHEN work_term_definitions.review_status='reviewed' THEN work_term_definitions.explanation ELSE EXCLUDED.explanation END,
            category=CASE WHEN work_term_definitions.review_status='reviewed' THEN work_term_definitions.category ELSE EXCLUDED.category END,
            source_label=EXCLUDED.source_label,confidence=EXCLUDED.confidence,
            source_note_count=EXCLUDED.source_note_count,source_variants=EXCLUDED.source_variants,
            auto_propagation_enabled=EXCLUDED.auto_propagation_enabled,updated_at=now()
          RETURNING id,explanation,category,confidence,review_status
        `, [
          work.id, termId, definition.explanation, definition.category || null, definition.sourceLabel || null,
          definition.confidence || null, definition.reviewStatus, definition.sourceNoteCount,
          json(definition.sourceVariants), definition.autoPropagationEnabled,
        ])
        definitionIds.set(definition.canonicalKey, definitionResult.rows[0].id)
        resolvedDefinitions.set(definition.canonicalKey, definitionResult.rows[0])
      }
      const retainedDefinitionIds = [...definitionIds.values()]
      if (retainedDefinitionIds.length) {
        await tx.query(
          'DELETE FROM work_term_definitions WHERE work_id=$1 AND NOT (id=ANY($2::bigint[]))',
          [work.id, retainedDefinitionIds],
        )
      } else {
        await tx.query('DELETE FROM work_term_definitions WHERE work_id=$1', [work.id])
      }
      const mentionRows = work.termIndex.mentions.map((mention) => ({
        definition_id: definitionIds.get(mention.canonicalKey),
        passage_id: mention.passageId,
        start_offset: mention.startOffset,
        end_offset: mention.endOffset,
        matched_text: mention.matchedText,
        source_method: mention.sourceMethod,
        displayable: mention.displayable && resolvedDefinitions.get(mention.canonicalKey)?.review_status !== 'rejected',
        created_at: new Date(),
      }))
      await insertRows(tx, 'term_mentions', [
        'definition_id','passage_id','start_offset','end_offset','matched_text','source_method','displayable','created_at',
      ], mentionRows, chunkSize)

      const enrichmentRows = work.passages.map((passage) => {
        const record = passage.sourceRecord
        const readingNotes = (passage.readingNotes ?? []).flatMap((note) => {
          const resolved = resolvedDefinitions.get(canonicalTermKey(note))
          if (!resolved || resolved.review_status === 'rejected') return []
          return [{
            ...note,
            explanation: String(resolved.explanation),
            category: resolved.category ? String(resolved.category) : note.category,
            confidence: resolved.confidence ? String(resolved.confidence) : note.confidence,
            status: resolved.review_status === 'reviewed' ? 'human_reviewed' : note.status,
          }]
        })
        return {
          passage_id: passage.id,
          source_record_id: `${record.id}:${passage.id}`,
          title_traditional: record.title.traditional,
          title_simplified: record.title.simplified,
          title_is_original: Boolean(record.title.is_original),
          original_traditional: passage.originalText,
          original_simplified: passage.originalText,
          original_simplified_pinyin: passage.pinyin,
          pinyin_status: passage.pinyinStatus,
          keywords: json([]),
          reading_notes: json(readingNotes),
          source_url: record.primary_source.url,
          source_revision_id: String(record.primary_source.revision_id),
          source_license: record.primary_source.license,
          source_record_hash: passage.contentHash,
          imported_at: new Date(),
        }
      })
      await insertRows(tx, 'passage_enrichments', [
        'passage_id','source_record_id','title_traditional','title_simplified','title_is_original',
        'original_traditional','original_simplified','original_simplified_pinyin','pinyin_status','keywords',
        'reading_notes','source_url','source_revision_id','source_license','source_record_hash','imported_at',
      ], enrichmentRows, chunkSize, ['keywords','reading_notes'])

      const translationRows = work.passages.map((passage) => ({
        passage_id: passage.id,
        language: 'zh-Hans',
        content: passage.translation.translation_simplified,
        content_hash: passage.translation.translation_sha256,
        source_content_hash: passage.contentHash,
        model: 'Codex',
        prompt_version: `buddhist-canon-core-v${packageData.manifest.dataset_version}`,
        origin: 'ai',
        source_name: '观自在开放来源包 AI 白话草稿',
        source_url: passage.sourceUrl,
        license_note: '项目原创 AI 派生草稿；未真人审核，不可作为审定译文发布。',
        quality_report: json({
          qualityFlags: passage.translation.quality_flags ?? [],
          humanReviewed: false,
          sourceBasis: passage.translation.source_basis,
          sourceStart: passage.translation.source_start,
          sourceEnd: passage.translation.source_end,
        }),
        status: 'draft',
        created_at: new Date(),
        published_at: null,
      }))
      await insertRows(tx, 'translations', [
        'passage_id','language','content','content_hash','source_content_hash','model','prompt_version',
        'origin','source_name','source_url','license_note','quality_report','status','created_at','published_at',
      ], translationRows, chunkSize, ['quality_report'])

      const translationSegmentRows = work.passages.flatMap((passage) => passage.segments.map((segment) => ({
        passage_id: passage.id,
        segment_index: segment.segment_index,
        source_text: segment.source_text,
        translation_text: segment.translation_simplified,
        method: passage.sourceRecord.translation.method ?? null,
        model: 'Codex',
        quality_flags: json(segment.quality_flags ?? []),
        human_reviewed: false,
        source_snapshot_hash: passage.contentHash,
        imported_at: new Date(),
      })))
      await insertRows(tx, 'translation_draft_segments', [
        'passage_id','segment_index','source_text','translation_text','method','model','quality_flags',
        'human_reviewed','source_snapshot_hash','imported_at',
      ], translationSegmentRows, chunkSize, ['quality_flags'])
    }

    const candidateRows = packageData.replacementMap.entries.map((entry) => ({
      source_batch: packageData.batchId,
      replacement_key: entry.replacement_key,
      new_record_id: entry.new_record_id,
      old_record_id: entry.old_record_id,
      new_source_hash: entry.source_sha256,
      old_source_hash: entry.old_source_sha256,
      action: entry.action,
      metadata: json(entry),
      imported_at: new Date(),
    }))
    await insertRows(tx, 'replacement_candidates', [
      'source_batch','replacement_key','new_record_id','old_record_id','new_source_hash',
      'old_source_hash','action','metadata','imported_at',
    ], candidateRows, chunkSize, ['metadata'])
    await tx.query(`
      UPDATE import_jobs SET status='completed',imported_count=$1,failed_count=0,completed_at=now() WHERE id=$2
    `, [packageData.works.length, jobId])
    return { jobId, importedWorks: packageData.works.length }
  })
}

export async function verifyBuddhistCanonImport(db, packageData) {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::integer FROM works WHERE source_batch=$1) AS works,
      (SELECT count(*)::integer FROM content_records WHERE source_batch=$1) AS records,
      (SELECT count(*)::integer FROM passages p JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1) AS passages,
      (SELECT count(*)::integer FROM translations t JOIN passages p ON p.id=t.passage_id JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1) AS translations,
      (SELECT count(*)::integer FROM passage_enrichments e JOIN passages p ON p.id=e.passage_id JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1) AS enrichments,
      (SELECT count(*)::integer FROM translation_draft_segments d JOIN passages p ON p.id=d.passage_id JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1) AS translation_segments,
      (SELECT count(*)::integer FROM content_sources s JOIN content_records r ON r.id=s.record_id WHERE r.source_batch=$1 AND s.role='primary') AS primary_sources,
      (SELECT coalesce(sum(jsonb_array_length(reading_notes)),0)::integer FROM content_records WHERE source_batch=$1) AS notes,
      (SELECT coalesce(sum(jsonb_array_length(e.reading_notes)),0)::integer FROM passage_enrichments e JOIN passages p ON p.id=e.passage_id JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1) AS reading_notes,
      (SELECT count(*)::integer FROM work_term_definitions d JOIN works w ON w.id=d.work_id WHERE w.source_batch=$1) AS term_definitions,
      (SELECT count(*)::integer FROM term_mentions m JOIN work_term_definitions d ON d.id=m.definition_id JOIN works w ON w.id=d.work_id WHERE w.source_batch=$1) AS term_mentions,
      (SELECT count(DISTINCT m.passage_id)::integer FROM term_mentions m JOIN work_term_definitions d ON d.id=m.definition_id JOIN works w ON w.id=d.work_id WHERE w.source_batch=$1 AND m.displayable) AS term_covered_passages,
      (SELECT coalesce(sum(d.source_note_count)-count(*),0)::integer FROM work_term_definitions d JOIN works w ON w.id=d.work_id WHERE w.source_batch=$1) AS duplicate_source_notes,
      (SELECT coalesce(sum(source_han_character_count),0)::bigint FROM content_records WHERE source_batch=$1) AS source_characters,
      (SELECT coalesce(sum(character_count),0)::bigint FROM works WHERE source_batch=$1) AS reading_characters,
      (SELECT count(*)::integer FROM replacement_candidates WHERE source_batch=$1) AS replacement_candidates,
      (SELECT count(*)::integer FROM works WHERE source_batch=$1 AND (library<>'佛典' OR source_verification<>'unverified' OR publication_status<>'hidden' OR published_at IS NOT NULL)) AS unsafe_works,
      (SELECT count(*)::integer FROM translations t JOIN passages p ON p.id=t.passage_id JOIN works w ON w.id=p.work_id WHERE w.source_batch=$1 AND (t.status<>'draft' OR t.published_at IS NOT NULL)) AS unsafe_translations
  `, [packageData.batchId])
  const actual = result.rows[0]
  const expected = {
    works: packageData.totals.works,
    records: packageData.totals.records,
    passages: packageData.totals.passages,
    translations: packageData.totals.translations,
    enrichments: packageData.totals.enrichments,
    translation_segments: packageData.totals.readingTranslationSegments,
    primary_sources: packageData.totals.primarySourceComponents,
    notes: packageData.totals.notes,
    reading_notes: packageData.totals.readingNotes,
    term_definitions: packageData.totals.uniqueTermDefinitions,
    term_mentions: packageData.totals.termMentions,
    term_covered_passages: packageData.totals.termCoveredPassages,
    duplicate_source_notes: packageData.totals.duplicateSourceNotes,
    source_characters: BigInt(packageData.totals.sourceHanCharacters),
    reading_characters: BigInt(packageData.totals.readingHanCharacters),
    replacement_candidates: packageData.totals.records,
    unsafe_works: 0,
    unsafe_translations: 0,
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = typeof expectedValue === 'bigint' ? BigInt(actual[key]) : Number(actual[key])
    assert(actualValue === expectedValue, `Post-import ${key} mismatch: expected ${expectedValue}, got ${actual[key]}`)
  }
  return Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value]))
}

async function connectPostgres(url) {
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

async function connectPglite(path) {
  const { PGlite } = await import('@electric-sql/pglite')
  const database = new PGlite(path)
  const schemaExists = await database.query("SELECT to_regclass('public.works') AS name")
  if (!schemaExists.rows[0]?.name) {
    await database.exec(await readFile(resolve(dirname(new URL(import.meta.url).pathname), '..', 'postgres/schema.sql'), 'utf8'))
  }
  return {
    query: (text, params = []) => database.query(text, params),
    transaction: (callback) => database.transaction(async (tx) => callback({
      query: (text, params = []) => tx.query(text, params),
    })),
    close: () => database.close(),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const packageData = await loadBuddhistCanonPackage(args.input, {
    zip: args.zip,
    expectedZipSha256: args.expectedZipSha256,
  })
  const plan = buildPlan(packageData)
  await writeFile(args.plan, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(plan, null, 2))
  if (args.dryRun || (!args.databaseUrl && !args.pglite)) {
    console.log('Validation complete; no database writes performed.')
    return
  }
  const db = args.pglite ? await connectPglite(args.pglite) : await connectPostgres(args.databaseUrl)
  try {
    const imported = await importBuddhistCanonPackage(db, packageData, { chunkSize: args.chunkSize })
    const verification = await verifyBuddhistCanonImport(db, packageData)
    console.log(JSON.stringify({ ...imported, verification }, null, 2))
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
