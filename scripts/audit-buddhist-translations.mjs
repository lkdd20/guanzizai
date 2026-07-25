#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import postgres from 'postgres'

import { summarizeBuddhistTranslationAudits } from './lib/buddhist-translation-audit.mjs'

function parseArgs(argv) {
  const args = {
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || '',
    sourceBatch: 'buddhist-canon-core-open-source-v1.1.0',
    output: `output/buddhist-translation-audit-${new Date().toISOString().slice(0, 10)}.json`,
    top: 250,
    setHighRiskDraft: false,
    confirmWrite: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--') continue
    if (option === '--set-high-risk-draft') {
      args.setHighRiskDraft = true
      continue
    }
    if (option === '--confirm-write') {
      args.confirmWrite = true
      continue
    }
    if (option === '--all-published-buddhist') {
      args.sourceBatch = ''
      continue
    }
    const key = { '--database-url': 'databaseUrl', '--source-batch': 'sourceBatch', '--output': 'output', '--top': 'top' }[option]
    if (!key) throw new Error(`Unknown option: ${option}`)
    const value = argv[++index]
    if (!value) throw new Error(`${option} requires a value`)
    args[key] = key === 'top' ? Number(value) : value
  }
  if (!args.databaseUrl) throw new Error('DATABASE_DIRECT_URL or DATABASE_URL is required')
  if (!Number.isInteger(args.top) || args.top < 1 || args.top > 5000) throw new Error('--top must be 1-5000')
  if (args.setHighRiskDraft && !args.confirmWrite) {
    throw new Error('--set-high-risk-draft requires --confirm-write')
  }
  return args
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sql = postgres(args.databaseUrl, { max: 2, prepare: false, idle_timeout: 5 })
  try {
    console.error('Reading published Buddhist works and term policies...')
    const [works, termRows] = await Promise.all([
      sql`
        SELECT
          w.id AS work_id,
          w.title AS work_title,
          count(p.id)::integer AS passage_count
        FROM works w
        JOIN passages p ON p.work_id = w.id
        JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans' AND t.status = 'published'
        WHERE w.library = '佛典'
          AND w.publication_status = 'published'
          AND t.origin = 'ai'
          AND (${args.sourceBatch || null}::text IS NULL OR w.source_batch = ${args.sourceBatch || null})
        GROUP BY w.id, w.title
        ORDER BY w.id
      `,
      sql`
        SELECT DISTINCT
          w.id AS work_id,
          gt.term_traditional,
          gt.term_simplified
        FROM works w
        JOIN work_term_definitions wd ON wd.work_id = w.id
        JOIN glossary_terms gt ON gt.id = wd.term_id
        WHERE w.library = '佛典'
          AND w.publication_status = 'published'
          AND (${args.sourceBatch || null}::text IS NULL OR w.source_batch = ${args.sourceBatch || null})
        ORDER BY w.id, gt.term_traditional
      `,
    ])
    console.error(`Found ${works.length} works with ${termRows.length} work-specific term definitions.`)
    const termsByWork = new Map()
    for (const term of termRows) {
      const workId = String(term.work_id)
      const workTerms = termsByWork.get(workId) ?? []
      workTerms.push({ termTraditional: String(term.term_traditional), termSimplified: String(term.term_simplified) })
      termsByWork.set(workId, workTerms)
    }
    const rows = []
    for (const work of works) {
      const workId = String(work.work_id)
      const passageCount = Number(work.passage_count)
      let afterSequence = 0
      let readCount = 0
      console.error(`Reading ${work.work_title} (${passageCount} passages)...`)
      while (true) {
        const page = await sql`
          SELECT
            ${workId}::text AS work_id,
            ${String(work.work_title)}::text AS work_title,
            p.id AS passage_id,
            p.sequence,
            p.original_text AS original,
            t.content AS translation
          FROM passages p
          JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans' AND t.status = 'published'
          WHERE p.work_id = ${workId}
            AND p.sequence > ${afterSequence}
            AND t.origin = 'ai'
          ORDER BY p.sequence
          LIMIT 500
        `
        if (!page.length) break
        const workTerms = termsByWork.get(workId) ?? []
        for (const row of page) row.terms = workTerms
        rows.push(...page)
        readCount += page.length
        afterSequence = Number(page.at(-1).sequence)
        console.error(`  ${readCount}/${passageCount}`)
        if (page.length < 500) break
      }
    }
    console.error(`Auditing ${rows.length} passages...`)
    const summary = summarizeBuddhistTranslationAudits(rows)
    const highRiskPassages = summary.passages.filter((passage) => passage.riskLevel === 'high')
    let writeResult = null
    if (args.setHighRiskDraft) {
      const checkedAt = new Date().toISOString()
      let updated = 0
      console.error(`Withdrawing ${highRiskPassages.length} high-risk translations to draft...`)
      await sql.begin(async (transaction) => {
        for (const passageIds of chunk(highRiskPassages.map((passage) => passage.passageId), 250)) {
          const rows = await transaction`
            UPDATE translations t SET
              status = 'draft',
              reviewer = NULL,
              published_at = NULL,
              quality_report = COALESCE(t.quality_report, '{}'::jsonb) || ${transaction.json({
                automatedRiskAudit: {
                  version: 'buddhist-translation-risk-audit-v1',
                  riskLevel: 'high',
                  checkedAt,
                  action: 'withdrawn_to_draft',
                  humanReviewed: false,
                },
              })}::jsonb
            WHERE t.language = 'zh-Hans'
              AND t.origin = 'ai'
              AND t.status = 'published'
              AND t.passage_id = ANY(${passageIds}::text[])
            RETURNING t.passage_id
          `
          updated += rows.length
          console.error(`  withdrawn ${updated}/${highRiskPassages.length}`)
        }
      })
      writeResult = { requested: highRiskPassages.length, updated, checkedAt }
      if (updated !== highRiskPassages.length) {
        throw new Error(`write_verification_failed: expected ${highRiskPassages.length}, updated ${updated}`)
      }
    }
    const report = {
      schemaVersion: 'buddhist-translation-risk-audit-v1',
      generatedAt: new Date().toISOString(),
      scope: {
        library: '佛典',
        publicationStatus: 'published',
        translationOrigin: 'ai',
        sourceBatch: args.sourceBatch || null,
      },
      methodology: {
        deterministicOnly: true,
        promotesReviewStatus: false,
        note: '风险命中用于安排人工复核，不表示机器已经证明译文错误或正确。',
      },
      totals: summary.totals,
      works: summary.works,
      issueCounts: summary.issueCounts,
      writeResult,
      highRiskPassages: highRiskPassages.slice(0, args.top),
      reviewQueue: summary.passages.filter((passage) => passage.riskLevel !== 'clear').slice(0, args.top),
    }
    const outputPath = resolve(args.output)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ outputPath, ...report.totals, works: report.works, topIssues: report.issueCounts.slice(0, 12), writeResult }, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
