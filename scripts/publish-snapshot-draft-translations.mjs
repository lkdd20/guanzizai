#!/usr/bin/env node

import { createHash } from 'node:crypto'

const workId = 'dzg-d0a3dfbdc761123d'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalize(value) {
  return value.replace(/\s+/gu, '')
}

function parseArgs(argv) {
  const args = {
    apply: false,
    databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      args.apply = true
      continue
    }
    if (arg === '--database-url') {
      args.databaseUrl = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/publish-snapshot-draft-translations.mjs [--apply] [--database-url <url>]')
      process.exit(0)
    }
    throw new Error(`Unknown option: ${arg}`)
  }
  if (!args.databaseUrl) throw new Error('DATABASE_DIRECT_URL or DATABASE_URL is required')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { default: postgres } = await import('postgres')
  const sql = postgres(args.databaseUrl, { max: 1, prepare: false })
  try {
    const rows = await sql`
      SELECT p.id AS passage_id,p.content_hash,e.source_record_id,e.title_simplified,e.original_simplified,
             d.segment_index,d.source_text,d.translation_text,d.method,d.model,d.quality_flags
      FROM passages p
      JOIN passage_enrichments e ON e.passage_id=p.id
      JOIN translation_draft_segments d ON d.passage_id=p.id
      WHERE p.work_id=${workId} AND d.human_reviewed=false
      ORDER BY p.sequence,d.segment_index
    `
    const grouped = new Map()
    for (const row of rows) {
      const entry = grouped.get(row.passage_id) ?? { passage: row, segments: [] }
      entry.segments.push(row)
      grouped.set(row.passage_id, entry)
    }
    const complete = []
    const incomplete = []
    for (const entry of grouped.values()) {
      const source = entry.segments.map((segment) => segment.source_text).join('')
      const translation = entry.segments.map((segment) => segment.translation_text.trim()).filter(Boolean).join('\n\n')
      const coverage = normalize(source).length / Math.max(1, normalize(entry.passage.original_simplified).length)
      const item = {
        passageId: entry.passage.passage_id,
        sourceRecordId: entry.passage.source_record_id,
        title: entry.passage.title_simplified,
        sourceContentHash: entry.passage.content_hash,
        model: entry.segments[0]?.model ?? null,
        method: entry.segments[0]?.method ?? null,
        segmentCount: entry.segments.length,
        translation,
        coverage,
        complete: normalize(source) === normalize(entry.passage.original_simplified),
        qualityFlags: entry.segments.flatMap((segment) => Array.isArray(segment.quality_flags) ? segment.quality_flags : []),
      }
      ;(item.complete ? complete : incomplete).push(item)
    }
    const report = {
      mode: args.apply ? 'apply' : 'dry-run',
      sourceArticles: grouped.size,
      sourceSegments: rows.length,
      publishableCompleteArticles: complete.length,
      incompleteArticles: incomplete.map((item) => ({
        sourceRecordId: item.sourceRecordId,
        title: item.title,
        coverage: Number(item.coverage.toFixed(4)),
      })),
    }
    console.log(JSON.stringify(report, null, 2))
    if (!args.apply) return

    await sql.begin(async (tx) => {
      for (const item of complete) {
        const contentHash = sha256(item.translation)
        const qualityReport = {
          sourceRecordId: item.sourceRecordId,
          completeSourceCoverage: true,
          segmentCount: item.segmentCount,
          humanReviewed: false,
          ownerAcceptedWithoutFullReview: true,
          qualityFlags: item.qualityFlags,
        }
        await tx`
          INSERT INTO translations (
            passage_id,language,content,content_hash,source_content_hash,model,prompt_version,
            origin,source_name,source_url,license_note,quality_report,status,reviewer,created_at,published_at
          ) VALUES (
            ${item.passageId},'zh-Hans',${item.translation},${contentHash},${item.sourceContentHash},${item.model},
            'wikisource-classics-snapshot-2026-07-14','ai','开发快照机器试译',
            'https://huggingface.co/raynardj/wenyanwen-ancient-translate-to-modern',
            '项目负责人接受抽样核对后作为 AI 白话辅助展示；未逐篇人工审定。',
            ${tx.json(qualityReport)},
            'published','项目负责人抽样确认（免逐篇审定）',now(),now()
          )
          ON CONFLICT (passage_id,language) DO UPDATE SET
            content=EXCLUDED.content,content_hash=EXCLUDED.content_hash,
            source_content_hash=EXCLUDED.source_content_hash,model=EXCLUDED.model,
            prompt_version=EXCLUDED.prompt_version,origin='ai',source_name=EXCLUDED.source_name,
            source_url=EXCLUDED.source_url,license_note=EXCLUDED.license_note,
            quality_report=EXCLUDED.quality_report,status='published',reviewer=EXCLUDED.reviewer,published_at=now()
        `
      }
    })
    const [verification] = await sql`
      SELECT count(*)::int published,
             count(*) FILTER (WHERE source_content_hash=p.content_hash)::int source_hash_matches
      FROM translations t JOIN passages p ON p.id=t.passage_id
      WHERE p.work_id=${workId} AND t.status='published'
    `
    console.log(JSON.stringify({ verification }, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
