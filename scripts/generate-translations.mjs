#!/usr/bin/env node
import { createHash } from 'node:crypto'
import postgres from 'postgres'

const promptVersion = 'classical-zh-hans-v1'

function parseArgs(argv) {
  const args = {
    work: '', limit: 20, concurrency: 2, databaseUrl: process.env.DATABASE_DIRECT_URL?.trim() || '',
    apiKey: process.env.NEWAPI_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || '',
    baseUrl: process.env.NEWAPI_BASE_URL?.trim().replace(/\/+$/, '') || '',
    model: process.env.NEWAPI_MODEL?.trim() || '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const key = { '--work': 'work', '--limit': 'limit', '--concurrency': 'concurrency', '--database-url': 'databaseUrl', '--model': 'model' }[argv[index]]
    if (!key) throw new Error(`Unknown option: ${argv[index]}`)
    const value = argv[++index]
    if (!value) throw new Error(`${argv[index - 1]} requires a value`)
    args[key] = ['limit', 'concurrency'].includes(key) ? Number(value) : value
  }
  if (!args.work) throw new Error('Usage: node scripts/generate-translations.mjs --work <id> [--limit 20]')
  if (!args.databaseUrl) throw new Error('DATABASE_DIRECT_URL is required')
  if (!args.apiKey) throw new Error('NEWAPI_API_KEY or DEEPSEEK_API_KEY is required')
  if (!args.baseUrl) throw new Error('NEWAPI_BASE_URL is required')
  if (!args.model) throw new Error('NEWAPI_MODEL or --model is required')
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) throw new Error('--limit must be 1-500')
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 8) throw new Error('--concurrency must be 1-8')
  return args
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function qualityReport(original, translation) {
  const issues = []
  const ratio = [...translation].length / Math.max(1, [...original].length)
  if (!translation.trim()) issues.push('empty')
  if (ratio < 0.45) issues.push('possibly_truncated')
  if (ratio > 3.5) issues.push('possibly_expanded')
  if (/作为(?:一个)?AI|无法翻译|以下是翻译|希望能帮到/u.test(translation)) issues.push('model_meta_text')
  if (translation.trim() === original.trim()) issues.push('unchanged_source')
  return { passed: issues.length === 0, issues, lengthRatio: Number(ratio.toFixed(3)) }
}

async function translate(args, original) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const response = await fetch(`${args.baseUrl}/v1/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { authorization: `Bearer ${args.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: args.model, temperature: 0.1,
        messages: [
          { role: 'system', content: '你是古典汉语白话翻译器。忠实逐意翻译，不增补情节、评价、考据或宗教解释；保留人名地名；只输出白话译文，不输出标题、说明或原文。' },
          { role: 'user', content: original },
        ],
      }),
    })
    if (!response.ok) throw new Error(`model_http_${response.status}`)
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('model_empty')
    return content
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sql = postgres(args.databaseUrl, { max: args.concurrency + 1, prepare: false })
  try {
    const passages = await sql`
      SELECT p.id, p.original_text, p.content_hash
      FROM passages p JOIN works w ON w.id = p.work_id
      LEFT JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans'
      WHERE p.work_id = ${args.work} AND w.publication_status = 'published'
        AND (t.id IS NULL OR t.source_content_hash <> p.content_hash)
      ORDER BY p.sequence LIMIT ${args.limit}
    `
    const [job] = await sql`
      INSERT INTO translation_jobs (work_id, model, prompt_version, requested_count)
      VALUES (${args.work}, ${args.model}, ${promptVersion}, ${passages.length}) RETURNING id
    `
    let completed = 0
    const errors = []
    let cursor = 0
    async function worker() {
      while (cursor < passages.length) {
        const passage = passages[cursor++]
        try {
          const content = await translate(args, passage.original_text)
          const report = qualityReport(passage.original_text, content)
          await sql`
            INSERT INTO translations (
              passage_id, language, content, content_hash, source_content_hash, model,
              prompt_version, origin, quality_report, status
            ) VALUES (
              ${passage.id}, 'zh-Hans', ${content}, ${sha256(content)}, ${passage.content_hash}, ${args.model},
              ${promptVersion}, 'ai', ${sql.json(report)}, 'draft'
            )
            ON CONFLICT (passage_id, language) DO UPDATE SET
              content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
              source_content_hash = EXCLUDED.source_content_hash, model = EXCLUDED.model,
              prompt_version = EXCLUDED.prompt_version, origin = 'ai',
              quality_report = EXCLUDED.quality_report, status = 'draft', reviewer = NULL, published_at = NULL
          `
          completed += 1
        } catch (error) {
          errors.push({ passageId: passage.id, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    await Promise.all(Array.from({ length: args.concurrency }, () => worker()))
    await sql`
      UPDATE translation_jobs SET
        status = ${errors.length ? 'failed' : 'completed'}, completed_count = ${completed},
        failed_count = ${errors.length}, error_summary = ${sql.json(errors)}, completed_at = now()
      WHERE id = ${job.id}
    `
    console.log(JSON.stringify({ jobId: job.id, workId: args.work, requested: passages.length, completed, errors }, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
