#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const forbiddenTopLevelDirectories = new Set(['佛藏', '道藏'])
const fullReviewTitles = new Set(
  (process.env.FULL_REVIEW_TITLES ?? '')
    .split(',')
    .map((title) => title.trim())
    .filter(Boolean),
)
const contentRules = [
  { id: 'cbeta-marker', description: 'CBETA/中华电子佛典来源标记', pattern: /CBETA|中[華华]電子佛典/i },
  { id: 'taisho-canon-marker', description: '大正藏来源标记', pattern: /大正新[脩修]大藏[經经]|大正藏(?:第|\s)/ },
  { id: 'xuzangjing-marker', description: '卍续藏来源标记', pattern: /卍(?:新纂)?[續续]藏[經经]|卍[續续]藏/ },
  { id: 'ctext-marker', description: '中国哲学书电子化计划来源标记', pattern: /中國哲學書電子化計劃|中国哲学书电子化计划|ctext\.org/i },
  {
    id: 'taoist-canon-source',
    description: '正统道藏底本标记',
    pattern: /底本出[處处][：:]\s*《?(?:正統|正统)道藏|(?:正統|正统)道藏(?:太|洞|正一|[續续])/,
  },
  {
    id: 'buddhist-canon-opening',
    description: '佛经典型经首组合',
    test(text) {
      const head = text.slice(0, 8000)
      return /(?:佛[說说].{0,80}[經经]|[經经]名[：:])/.test(head) && /如是我[聞闻].{0,80}一[時时]/s.test(head)
    },
  },
]

function usage() {
  return [
    'Usage: node scripts/ingest-daizhige-bulk.mjs [options]',
    '',
    'Options:',
    '  --source <dir>   Source checkout (default: daizhige-src)',
    '  --out <dir>      Output directory (default: out/<batch>)',
    '  --batch <name>   Traceable source batch (default: daizhige-YYYY-MM-DD)',
    '  --dry-run        Write manifest/QA reports only; do not write import JSON or SQL',
    '',
    'Optional environment:',
    '  FULL_REVIEW_TITLES  Comma-separated titles that require complete manual review',
  ].join('\n')
}

function defaultBatch() {
  return `daizhige-${new Date().toISOString().slice(0, 10)}`
}

function parseArgs(argv) {
  const args = { source: 'daizhige-src', out: undefined, batch: defaultBatch(), dryRun: false }
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
    if (['--source', '--out', '--batch'].includes(arg)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      args[arg.slice(2)] = value
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(args.batch)) {
    throw new Error('--batch contains unsupported characters')
  }
  args.source = resolve(process.cwd(), args.source)
  args.out = resolve(process.cwd(), args.out ?? `out/${args.batch}`)
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function toPosixPath(path) {
  return path.split(sep).join('/')
}

async function walkTxtFiles(root) {
  const files = []
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.txt') files.push(path)
    }
  }
  await walk(root)
  return files
}

function decodeUtf8(buffer, sourcePath) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  } catch {
    throw new Error(`Invalid UTF-8: ${sourcePath}`)
  }
}

function contentExclusionReasons(text) {
  return contentRules
    .filter((rule) => (rule.test ? rule.test(text) : rule.pattern.test(text)))
    .map((rule) => rule.id)
}

function splitLongBlock(block, maxCharacters = 1800) {
  if (Array.from(block).length <= maxCharacters) return [block]
  const chunks = []
  let current = ''
  for (const line of block.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line
    if (Array.from(candidate).length <= maxCharacters) {
      current = candidate
      continue
    }
    if (current) chunks.push(current)
    const characters = Array.from(line)
    for (let offset = 0; offset < characters.length; offset += maxCharacters) {
      const slice = characters.slice(offset, offset + maxCharacters).join('')
      if (slice) chunks.push(slice)
    }
    current = ''
  }
  if (current) chunks.push(current)
  return chunks
}

function splitPassages(text) {
  return text
    .split(/\n[\t \u3000]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitLongBlock(block))
}

function readableCharCount(text) {
  return Array.from(text).filter((character) => /[\p{Letter}\p{Number}]/u.test(character)).length
}

function punctuationQuality(text) {
  const leadingClosingQuoteLines = text.split('\n').filter((line) => /^\s*[」』”’]/u.test(line)).length
  const possibleRepeatedClosingQuotes = [...text.matchAll(/[」』”’]{2,}/gu)].length
  return { leadingClosingQuoteLines, possibleRepeatedClosingQuotes }
}

function workId(relativePath) {
  return `dzg-${sha256(relativePath).slice(0, 16)}`
}

function workTitle(relativePath) {
  return basename(relativePath, extname(relativePath)).trim()
}

function titleMatchesPriority(title) {
  return [...fullReviewTitles].find((priorityTitle) => title === priorityTitle || title.startsWith(`${priorityTitle}（`) || title.startsWith(`${priorityTitle}(`))
}

function categoryFor(parts) {
  return parts.length > 1 ? parts[1] : parts[0]
}

function samplePassages(passages) {
  const sampleCount = Math.ceil(passages.length * 0.08)
  if (!sampleCount) return []
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const index = Math.min(passages.length - 1, Math.floor(((sampleIndex + 0.5) * passages.length) / sampleCount))
    return {
      seq: index + 1,
      excerpt: Array.from(passages[index]).slice(0, 240).join(''),
    }
  })
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function buildWork(relativePath, text, batch) {
  const parts = toPosixPath(relativePath).split('/')
  const title = workTitle(relativePath)
  const id = workId(toPosixPath(relativePath))
  const originals = splitPassages(text)
  const passages = originals.map((original, index) => ({
    id: `${id}_j1_${String(index + 1).padStart(6, '0')}`,
    juan: 1,
    pin: null,
    seq: index + 1,
    original,
    cbeta_line_ref: null,
    char_count: readableCharCount(original),
    sha256: sha256(original),
    terms: [],
  }))
  const charCount = passages.reduce((sum, passage) => sum + passage.char_count, 0)
  return {
    sutra: {
      id,
      library: '国学',
      source_verification: 'unverified',
      source_batch: batch,
      cbeta_work_id: null,
      taisho_vol: null,
      no: null,
      title_zh: title,
      byline: null,
      dynasty: null,
      canon: parts[0],
      category: categoryFor(parts),
      source_edition: `殆知阁 daizhigev20 · ${toPosixPath(relativePath)} · 批量收录，未核验`,
      juan_count: 1,
      char_count: charCount,
      sha256: sha256(passages.map((passage) => passage.original).join('')),
      created_at: new Date().toISOString(),
    },
    passages,
    textQuality: punctuationQuality(text),
  }
}

function buildSql(work) {
  const sutraColumns = [
    'id', 'library', 'source_verification', 'source_batch', 'cbeta_work_id', 'taisho_vol', 'no', 'title_zh',
    'byline', 'dynasty', 'canon', 'category', 'source_edition', 'juan_count', 'char_count', 'sha256', 'created_at',
  ]
  const passageColumns = ['id', 'sutra_id', 'juan', 'pin', 'seq', 'original', 'cbeta_line_ref', 'char_count', 'sha256']
  const lines = [
    'BEGIN TRANSACTION;',
    `INSERT OR REPLACE INTO sutras (${sutraColumns.join(', ')}) VALUES (${sutraColumns.map((column) => sqlValue(work.sutra[column])).join(', ')});`,
    `DELETE FROM translations WHERE passage_id IN (SELECT id FROM passages WHERE sutra_id = ${sqlValue(work.sutra.id)});`,
    `DELETE FROM passages WHERE sutra_id = ${sqlValue(work.sutra.id)};`,
  ]
  for (const passage of work.passages) {
    const row = { ...passage, sutra_id: work.sutra.id }
    lines.push(`INSERT INTO passages (${passageColumns.join(', ')}) VALUES (${passageColumns.map((column) => sqlValue(row[column])).join(', ')});`)
  }
  lines.push('COMMIT;', '')
  return lines.join('\n')
}

async function sourceCommit(source) {
  try {
    return execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = await walkTxtFiles(args.source)
  const excludedByDir = []
  const excludedByContent = []
  const included = []
  const qa = { batch: args.batch, fullReview: [], spotCheck: [] }
  const textQuality = { affectedFiles: [], leadingClosingQuoteLines: 0, possibleRepeatedClosingQuotes: 0 }
  const priorityTitleAudit = { included: [], excluded: [], missing: [] }
  const foundPriorityTitles = new Set()
  const licenseFiles = (await readdir(args.source))
    .filter((name) => /^(license|copying)(\.|$)/i.test(name))

  if (!args.dryRun) {
    await mkdir(join(args.out, 'json'), { recursive: true })
    await mkdir(join(args.out, 'sql'), { recursive: true })
  }

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex]
    const relativePath = toPosixPath(relative(args.source, file))
    const parts = relativePath.split('/')
    const title = workTitle(relativePath)
    const priorityTitle = titleMatchesPriority(title)
    if (priorityTitle) foundPriorityTitles.add(priorityTitle)

    if (forbiddenTopLevelDirectories.has(parts[0])) {
      const record = { relativePath, reason: `forbidden-directory:${parts[0]}` }
      excludedByDir.push(record)
      if (priorityTitle) priorityTitleAudit.excluded.push({ title: priorityTitle, sourceTitle: title, ...record })
      continue
    }

    const buffer = await readFile(file)
    let text
    try {
      text = decodeUtf8(buffer, relativePath)
    } catch {
      excludedByContent.push({ relativePath, reasons: ['invalid-utf8'] })
      continue
    }
    const reasons = contentExclusionReasons(text)
    if (reasons.length) {
      const record = { relativePath, reasons }
      excludedByContent.push(record)
      if (priorityTitle) priorityTitleAudit.excluded.push({ title: priorityTitle, sourceTitle: title, ...record })
      continue
    }

    const work = buildWork(relativePath, text, args.batch)
    const record = {
      id: work.sutra.id,
      title,
      relativePath,
      category: work.sutra.category,
      bytes: buffer.byteLength,
      sourceSha256: sha256(buffer),
      passageCount: work.passages.length,
      charCount: work.sutra.char_count,
      textQuality: work.textQuality,
    }
    included.push(record)
    if (work.textQuality.leadingClosingQuoteLines || work.textQuality.possibleRepeatedClosingQuotes) {
      textQuality.affectedFiles.push({ id: work.sutra.id, relativePath, ...work.textQuality })
      textQuality.leadingClosingQuoteLines += work.textQuality.leadingClosingQuoteLines
      textQuality.possibleRepeatedClosingQuotes += work.textQuality.possibleRepeatedClosingQuotes
    }

    if (priorityTitle) {
      priorityTitleAudit.included.push({ title: priorityTitle, sourceTitle: title, relativePath, id: work.sutra.id })
      qa.fullReview.push({ ...record, review: 'all-passages' })
    } else {
      qa.spotCheck.push({ ...record, rate: 0.08, samples: samplePassages(work.passages) })
    }

    if (!args.dryRun) {
      await writeFile(join(args.out, 'json', `${work.sutra.id}.json`), `${JSON.stringify(work, null, 2)}\n`, 'utf8')
      await writeFile(join(args.out, 'sql', `${work.sutra.id}.sql`), buildSql(work), 'utf8')
    }

    if ((fileIndex + 1) % 250 === 0) console.log(`Scanned ${fileIndex + 1}/${files.length}`)
  }

  priorityTitleAudit.missing = [...fullReviewTitles].filter((title) => !foundPriorityTitles.has(title)).sort()
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'formal',
    batch: args.batch,
    source: {
      repository: 'https://github.com/garychowcmu/daizhigev20',
      commit: await sourceCommit(args.source),
      licenseFiles,
      licenseNotice: licenseFiles.length ? null : 'No repository license file detected; publication rights require explicit human confirmation.',
    },
    policy: {
      forbiddenTopLevelDirectories: [...forbiddenTopLevelDirectories],
      contentRules: contentRules.map(({ id, description }) => ({ id, description })),
    },
    totals: {
      files: files.length,
      included: included.length,
      excludedByDir: excludedByDir.length,
      excludedByContent: excludedByContent.length,
    },
    priorityTitleAudit,
    textQuality: {
      ...textQuality,
      note: '仅报告潜在标点问题，不自动改写原文；连续闭引号可能是嵌套引号，需人工复核。',
    },
    excludedByDir,
    excludedByContent,
    included,
  }

  await mkdir(args.out, { recursive: true })
  await writeFile(join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(join(args.out, 'qa-sample-list.json'), `${JSON.stringify(qa, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${join(args.out, 'manifest.json')}`)
  console.log(`Wrote ${join(args.out, 'qa-sample-list.json')}`)
  console.log(JSON.stringify(manifest.totals))
  if (args.dryRun) console.log('Dry-run complete: no import JSON or SQL was written.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
