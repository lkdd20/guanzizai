import 'server-only'

import postgres from 'postgres'

export type PublicationStatus = 'hidden' | 'catalog_only' | 'published'
export type DatabaseVerificationStatus = 'unverified' | 'reviewing' | 'verified' | 'rejected'

export interface DatabaseWorkSummary {
  id: string
  title: string
  author: string | null
  dynasty: string | null
  category: string | null
  library: string
  sourceBatch: string
  sourceVerification: DatabaseVerificationStatus
  publicationStatus: PublicationStatus
  sourceEdition: string
  sourcePath: string
  characterCount: number
  passageCount: number
  contentObjectKey: string | null
  contentObjectHash: string | null
  contentHash: string
  contentRevision: string
  importedAt: string
  readingStartSequence: number
  juanCount: number
  publishedTranslationCount: number
  sourceNoteCount: number
  glossaryTermCount: number
  duplicateSourceNoteCount: number
  termMentionCount: number
  displayableTermMentionCount: number
  termCoveredPassageCount: number
  termCoverageRatio: number
  orphanTermCount: number
  machineDraftTermCount: number
  reviewedTermCount: number
}

export interface DatabasePassage {
  id: string
  juan: number
  sequence: number
  original: string
  contentHash: string
  characterCount: number
  translation: string
  translationOrigin: 'ai' | 'licensed' | 'manual' | null
  translationSourceName: string | null
  translationContributor: string | null
  translationSegments: Array<{ index: number; source: string; translation: string }>
  enrichmentAvailable: boolean
  readingNotes: DatabasePassageEnrichment['readingNotes']
  keywords: string[]
}

export interface DatabasePassageEnrichment {
  passageId: string
  sourceRecordId: string
  titleTraditional: string
  titleSimplified: string
  titleIsOriginal: boolean
  originalTraditional: string
  originalSimplified: string
  originalSimplifiedPinyin: string
  pinyinStatus: string
  keywords: string[]
  readingNotes: Array<{
    termTraditional: string
    termSimplified: string
    pinyin?: string
    explanation: string
    category?: string
    source?: string
    confidence?: string
  }>
  sourceUrl: string
  sourceRevisionId: string
  sourceLicense: string
  sourceRecordHash: string
}

export interface DatabaseOutlineItem {
  key: string
  sequence: number
  endSequence: number
  title: string
  kind: 'body' | 'volume' | 'chapter' | 'section'
  level: number
  parentKey: string | null
}

export interface DatabaseDailyQuote {
  workId: string
  workTitle: string
  passageId: string
  sequence: number
  juan: number
  quote: string
  sourceVerification: DatabaseVerificationStatus
}

export interface DatabaseAskResource {
  id: string
  title: string
  library: string
  keywords: string[]
}

export interface DatabaseAskPassage {
  workId: string
  workTitle: string
  passageId: string
  sequence: number
  juan: number
  quote: string
  passageTitle: string
  sourceVerification: DatabaseVerificationStatus
}

export interface DatabaseAskPresetPassage extends DatabaseAskPassage {
  contentHash: string
}

let client: ReturnType<typeof postgres> | undefined

export function contentDatabaseEnabled() {
  return process.env.CONTENT_DATABASE_ENABLED?.trim().toLowerCase() === 'true'
}

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? ''
}

function sql() {
  if (!contentDatabaseEnabled() || !databaseUrl()) return null
  client ??= postgres(databaseUrl(), { max: 4, prepare: false })
  return client
}

export function contentSql() {
  return sql()
}

export function adminContentSql() {
  if (!databaseUrl()) return null
  client ??= postgres(databaseUrl(), { max: 4, prepare: false })
  return client
}

function mapWork(row: Record<string, unknown>): DatabaseWorkSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    author: row.author ? String(row.author) : null,
    dynasty: row.dynasty ? String(row.dynasty) : null,
    category: row.category ? String(row.category) : null,
    library: String(row.library),
    sourceBatch: String(row.source_batch),
    sourceVerification: String(row.source_verification) as DatabaseVerificationStatus,
    publicationStatus: String(row.publication_status) as PublicationStatus,
    sourceEdition: String(row.source_edition),
    sourcePath: String(row.source_path),
    characterCount: Number(row.character_count),
    passageCount: Number(row.passage_count),
    contentObjectKey: row.content_object_key ? String(row.content_object_key) : null,
    contentObjectHash: row.content_object_hash ? String(row.content_object_hash) : null,
    contentHash: String(row.content_hash),
    contentRevision: row.content_revision ? String(row.content_revision) : String(row.content_hash),
    importedAt: new Date(String(row.imported_at)).toISOString(),
    readingStartSequence: Number(row.reading_start_sequence ?? 0),
    juanCount: Number(row.juan_count ?? 0),
    publishedTranslationCount: Number(row.published_translation_count ?? 0),
    sourceNoteCount: Number(row.source_note_count ?? 0),
    glossaryTermCount: Number(row.glossary_term_count ?? 0),
    duplicateSourceNoteCount: Number(row.duplicate_source_note_count ?? 0),
    termMentionCount: Number(row.term_mention_count ?? 0),
    displayableTermMentionCount: Number(row.displayable_term_mention_count ?? 0),
    termCoveredPassageCount: Number(row.term_covered_passage_count ?? 0),
    termCoverageRatio: Number(row.passage_count) > 0
      ? Number(row.term_covered_passage_count ?? 0) / Number(row.passage_count)
      : 0,
    orphanTermCount: Number(row.orphan_term_count ?? 0),
    machineDraftTermCount: Number(row.machine_draft_term_count ?? 0),
    reviewedTermCount: Number(row.reviewed_term_count ?? 0),
  }
}

function jsonArray(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapPassage(row: Record<string, unknown>): DatabasePassage {
  const translation = String(row.translation ?? '')
  const rawSegments = jsonArray(row.translation_segments).map((segment) => {
    const item = segment as Record<string, unknown>
    return { index: Number(item.index), source: String(item.source ?? ''), translation: String(item.translation ?? '') }
  }).filter((segment) => Number.isFinite(segment.index) && segment.source && segment.translation)
  const aggregatedSegments = rawSegments.map((segment) => segment.translation.trim()).filter(Boolean).join('\n\n')
  const origin = row.translation_origin === 'ai' || row.translation_origin === 'licensed' || row.translation_origin === 'manual'
    ? row.translation_origin
    : row.translation_model ? 'ai' : 'manual'
  return {
    id: String(row.id),
    juan: Number(row.juan),
    sequence: Number(row.sequence),
    original: String(row.original_text),
    contentHash: String(row.content_hash),
    characterCount: Number(row.character_count),
    translation,
    translationOrigin: translation ? origin : null,
    translationSourceName: row.translation_source_name ? String(row.translation_source_name) : null,
    translationContributor: row.translation_contributor ? String(row.translation_contributor) : null,
    translationSegments: translation && origin === 'ai' && aggregatedSegments === translation ? rawSegments : [],
    enrichmentAvailable: row.enrichment_available === true,
    readingNotes: mapReadingNotes(row.reading_notes),
    keywords: jsonArray(row.keywords).map(String),
  }
}

function mapReadingNotes(value: unknown): DatabasePassageEnrichment['readingNotes'] {
  return jsonArray(value).map((note) => {
    const item = note as Record<string, unknown>
    return {
      termTraditional: String(item.term_traditional ?? ''),
      termSimplified: String(item.term_simplified ?? ''),
      pinyin: item.pinyin ? String(item.pinyin) : undefined,
      explanation: String(item.explanation ?? ''),
      category: item.category ? String(item.category) : item.kind ? String(item.kind) : undefined,
      source: item.source ? String(item.source) : item.status ? String(item.status) : undefined,
      confidence: item.confidence ? String(item.confidence) : undefined,
    }
  }).filter((note) => note.explanation && (note.termTraditional || note.termSimplified))
}

export async function listAdminWorks(limit = 50, includeWhenPublicReadDisabled = false): Promise<DatabaseWorkSummary[]> {
  const db = includeWhenPublicReadDisabled ? adminContentSql() : sql()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)))
  const rows = await db`
    WITH selected_works AS (
      SELECT * FROM works
      ORDER BY imported_at DESC, id
      LIMIT ${safeLimit}
    )
    SELECT w.*,
           COALESCE(term_metrics.source_note_count, 0)::integer AS source_note_count,
           COALESCE(term_metrics.glossary_term_count, 0)::integer AS glossary_term_count,
           COALESCE(term_metrics.duplicate_source_note_count, 0)::integer AS duplicate_source_note_count,
           COALESCE(term_metrics.machine_draft_term_count, 0)::integer AS machine_draft_term_count,
           COALESCE(term_metrics.reviewed_term_count, 0)::integer AS reviewed_term_count,
           COALESCE(term_metrics.orphan_term_count, 0)::integer AS orphan_term_count,
           COALESCE(mention_metrics.term_mention_count, 0)::integer AS term_mention_count,
           COALESCE(mention_metrics.displayable_term_mention_count, 0)::integer AS displayable_term_mention_count,
           COALESCE(mention_metrics.term_covered_passage_count, 0)::integer AS term_covered_passage_count
    FROM selected_works w
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(d.source_note_count), 0) AS source_note_count,
             count(*) AS glossary_term_count,
             COALESCE(sum(d.source_note_count), 0) - count(*) AS duplicate_source_note_count,
             count(*) FILTER (WHERE d.review_status='machine_draft') AS machine_draft_term_count,
             count(*) FILTER (WHERE d.review_status='reviewed') AS reviewed_term_count,
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM term_mentions m WHERE m.definition_id=d.id
             )) AS orphan_term_count
      FROM work_term_definitions d
      WHERE d.work_id=w.id
    ) term_metrics ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS term_mention_count,
             count(*) FILTER (WHERE m.displayable) AS displayable_term_mention_count,
             count(DISTINCT m.passage_id) FILTER (WHERE m.displayable) AS term_covered_passage_count
      FROM term_mentions m
      JOIN work_term_definitions d ON d.id=m.definition_id
      WHERE d.work_id=w.id
    ) mention_metrics ON true
    ORDER BY w.imported_at DESC, w.id
  `
  return rows.map((row) => mapWork(row))
}

export async function listPublishedCatalogWorks(): Promise<DatabaseWorkSummary[]> {
  const db = sql()
  if (!db) return []
  const rows = await db`
    SELECT w.*,
           (SELECT count(*)::integer FROM translations t JOIN passages p ON p.id=t.passage_id
            WHERE p.work_id=w.id AND t.language='zh-Hans' AND t.status='published') AS published_translation_count
    FROM works w
    WHERE w.publication_status = 'published'
    ORDER BY w.category, w.title
  `
  return rows.map((row) => mapWork(row))
}

export async function listPublishedAskResources(): Promise<DatabaseAskResource[]> {
  const db = sql()
  if (!db) return []
  const rows = await db`
    SELECT w.id, w.title, w.library
    FROM works w
    WHERE w.publication_status='published'
    ORDER BY CASE WHEN w.library='佛典' THEN 0 ELSE 1 END, w.category, w.title
  `
  const termsByWork = new Map<string, string[]>()
  try {
    const termRows = await db`
      WITH ranked_terms AS (
        SELECT d.work_id, g.term_simplified AS term,
               row_number() OVER (
                 PARTITION BY d.work_id
                 ORDER BY count(m.id) DESC, max(d.source_note_count) DESC, g.term_simplified
               ) AS rank
        FROM work_term_definitions d
        JOIN glossary_terms g ON g.id=d.term_id
        JOIN works w ON w.id=d.work_id AND w.publication_status='published'
        LEFT JOIN term_mentions m ON m.definition_id=d.id AND m.displayable
        WHERE d.review_status <> 'rejected'
          AND char_length(g.term_simplified) BETWEEN 2 AND 12
          AND g.term_simplified NOT IN ('佛教', '佛法', '经典', '原文', '众生', '菩萨')
        GROUP BY d.work_id, g.id, g.term_simplified
      )
      SELECT work_id, array_agg(term ORDER BY rank) AS terms
      FROM ranked_terms
      WHERE rank <= 4
      GROUP BY work_id
    `
    for (const row of termRows) {
      termsByWork.set(String(row.work_id), Array.isArray(row.terms) ? row.terms.map(String) : [])
    }
  } catch {
    // The published work list remains authoritative if optional term enrichment is unavailable.
  }
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    library: String(row.library),
    keywords: termsByWork.get(String(row.id)) ?? [],
  }))
}

export async function searchPublishedAskPassages(
  question: string,
  terms: string[],
  limit = 4,
  workIds: string[] = [],
): Promise<DatabaseAskPassage[]> {
  const db = sql()
  if (!db) return []
  const safeQuestion = question.trim().slice(0, 500)
  const safeTerms = terms
    .map((term) => term.replace(/[\\^$.*+?()[\]{}|]/gu, '').trim())
    .filter((term) => term.length >= 2)
    .slice(0, 16)
  const pattern = safeTerms.length ? safeTerms.join('|') : '$a'
  const safeLimit = Math.max(1, Math.min(8, Math.trunc(limit)))
  const safeWorkIds = [...new Set(workIds.filter((id) => /^[a-z0-9][a-z0-9-]{2,80}$/u.test(id)))].slice(0, 8)
  const rows = await db`
    SELECT w.id AS work_id, w.title AS work_title, w.source_verification,
           p.id AS passage_id, p.sequence,
           COALESCE(s.juan, 1) AS juan,
           COALESCE(NULLIF(e.title_simplified, ''), NULLIF(e.title_traditional, ''), NULLIF(s.title, ''), '') AS passage_title,
           CASE WHEN char_length(p.original_text) > 420
             THEN left(p.original_text, 420) || '…'
             ELSE p.original_text
           END AS quote
    FROM passages p
    JOIN works w ON w.id=p.work_id
    LEFT JOIN work_sections s ON s.id=p.section_id
    LEFT JOIN translations t ON t.passage_id=p.id AND t.language='zh-Hans' AND t.status='published'
    LEFT JOIN passage_enrichments e ON e.passage_id=p.id
    WHERE w.publication_status='published'
      AND p.sequence > w.reading_start_sequence
      AND (${safeWorkIds.length === 0} OR w.id=ANY(${safeWorkIds}))
      AND ${safeTerms.length > 0}
      AND (
        p.original_text ~ ${pattern}
        OR COALESCE(t.content, '') ~ ${pattern}
        OR COALESCE(e.title_traditional, '') ~ ${pattern}
        OR COALESCE(e.title_simplified, '') ~ ${pattern}
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(e.keywords, '[]'::jsonb)) AS keyword(value)
          WHERE keyword.value ~ ${pattern}
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(e.reading_notes, '[]'::jsonb)) AS note(value)
          WHERE concat_ws(' ', note.value->>'term_traditional', note.value->>'term_simplified', note.value->>'explanation') ~ ${pattern}
        )
      )
    ORDER BY (
      CASE WHEN COALESCE(NULLIF(e.title_simplified, ''), NULLIF(e.title_traditional, ''), NULLIF(s.title, ''), '')=ANY(${safeTerms}) THEN 24 ELSE 0 END
      + CASE WHEN position(w.title in ${safeQuestion}) > 0 THEN 12 ELSE 0 END
      + CASE WHEN p.original_text ~ ${pattern} THEN 8 ELSE 0 END
      + CASE WHEN COALESCE(t.content, '') ~ ${pattern} THEN 4 ELSE 0 END
      + CASE WHEN COALESCE(e.title_traditional, '') ~ ${pattern} OR COALESCE(e.title_simplified, '') ~ ${pattern} THEN 10 ELSE 0 END
    ) DESC,
    CASE WHEN p.original_text ~ ${pattern}
      OR COALESCE(e.title_traditional, '') ~ ${pattern}
      OR COALESCE(e.title_simplified, '') ~ ${pattern}
      THEN char_length(p.original_text)
      ELSE p.sequence
    END,
    p.sequence
    LIMIT ${safeLimit}
  `
  return rows.map((row) => ({
    workId: String(row.work_id),
    workTitle: String(row.work_title),
    passageId: String(row.passage_id),
    sequence: Number(row.sequence),
    juan: Number(row.juan),
    quote: String(row.quote).trim(),
    passageTitle: String(row.passage_title ?? '').trim(),
    sourceVerification: String(row.source_verification) as DatabaseVerificationStatus,
  }))
}

export async function getPublishedAskPresetPassages(passageIds: string[]): Promise<DatabaseAskPresetPassage[]> {
  const db = sql()
  if (!db) return []
  const safeIds = [...new Set(passageIds.filter((id) => /^[a-zA-Z0-9_-]{4,160}$/u.test(id)))].slice(0, 48)
  if (!safeIds.length) return []
  const rows = await db`
    SELECT w.id AS work_id, w.title AS work_title, w.source_verification,
           p.id AS passage_id, p.sequence, p.content_hash,
           COALESCE(s.juan, 1) AS juan,
           COALESCE(NULLIF(e.title_simplified, ''), NULLIF(e.title_traditional, ''), NULLIF(s.title, ''), '') AS passage_title,
           p.original_text AS quote
    FROM passages p
    JOIN works w ON w.id=p.work_id
    LEFT JOIN work_sections s ON s.id=p.section_id
    LEFT JOIN passage_enrichments e ON e.passage_id=p.id
    WHERE w.publication_status='published'
      AND p.sequence > w.reading_start_sequence
      AND p.id=ANY(${safeIds})
  `
  return rows.map((row) => ({
    workId: String(row.work_id),
    workTitle: String(row.work_title),
    passageId: String(row.passage_id),
    sequence: Number(row.sequence),
    juan: Number(row.juan),
    quote: String(row.quote).trim(),
    passageTitle: String(row.passage_title ?? '').trim(),
    contentHash: String(row.content_hash),
    sourceVerification: String(row.source_verification) as DatabaseVerificationStatus,
  }))
}

export async function getPublishedWork(id: string) {
  const db = sql()
  if (!db) return null
  const rows = await db`
    SELECT w.*,
           (SELECT count(*)::integer FROM work_sections s WHERE s.work_id=w.id AND s.kind='volume') AS juan_count,
           (SELECT count(*)::integer FROM translations t JOIN passages p ON p.id=t.passage_id
            WHERE p.work_id=w.id AND t.language='zh-Hans' AND t.status='published') AS published_translation_count
    FROM works w
    WHERE w.id = ${id} AND w.publication_status = 'published'
    LIMIT 1
  `
  return rows[0] ? mapWork(rows[0]) : null
}

export async function getPublishedPassages(workId: string, after = 0, limit = 30): Promise<DatabasePassage[]> {
  const db = sql()
  if (!db) return []
  const safeAfter = Math.max(0, Math.trunc(after))
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = await db`
    SELECT p.id, COALESCE(s.juan, 1) AS juan, p.sequence, p.original_text,
           p.content_hash, p.character_count, COALESCE(t.content, '') AS translation,
           t.model AS translation_model,
           to_jsonb(t)->>'origin' AS translation_origin,
           to_jsonb(t)->>'source_name' AS translation_source_name,
           to_jsonb(t)->>'contributor_name' AS translation_contributor,
           e.passage_id IS NOT NULL AS enrichment_available,
           COALESCE(e.reading_notes, '[]'::jsonb) AS reading_notes,
           COALESCE(e.keywords, '[]'::jsonb) AS keywords,
           CASE WHEN t.id IS NULL OR to_jsonb(t)->>'origin' <> 'ai' THEN '[]'::jsonb ELSE COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'index', d.segment_index, 'source', d.source_text, 'translation', d.translation_text
             ) ORDER BY d.segment_index)
             FROM translation_draft_segments d
             WHERE d.passage_id=p.id AND d.source_snapshot_hash=p.content_hash
           ), '[]'::jsonb) END AS translation_segments
    FROM passages p
    JOIN works w ON w.id = p.work_id
    LEFT JOIN work_sections s ON s.id = p.section_id
    LEFT JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans' AND t.status = 'published'
    LEFT JOIN passage_enrichments e ON e.passage_id = p.id
    WHERE p.work_id = ${workId} AND w.publication_status = 'published'
      AND p.sequence > GREATEST(${safeAfter}, w.reading_start_sequence)
    ORDER BY COALESCE(s.juan, 1), p.sequence
    LIMIT ${safeLimit}
  `
  return rows.map((row) => mapPassage(row))
}

export async function getDailyPublishedQuote(seed: string, keywords: string[]): Promise<DatabaseDailyQuote | null> {
  const db = sql()
  if (!db) return null
  const safeSeed = seed.slice(0, 32)
  const safeKeywords = keywords
    .map((keyword) => keyword.replace(/[\\^$.*+?()[\]{}|]/gu, '').trim())
    .filter(Boolean)
    .slice(0, 12)
  const pattern = safeKeywords.length ? safeKeywords.join('|') : '慈|悲|智慧|清净|精进|平等'
  const rows = await db`
    SELECT w.id AS work_id, w.title AS work_title, w.source_verification,
           p.id AS passage_id, p.sequence, COALESCE(s.juan, 1) AS juan,
           p.original_text AS quote
    FROM passages p
    JOIN works w ON w.id = p.work_id
    LEFT JOIN work_sections s ON s.id = p.section_id
    LEFT JOIN passage_enrichments e ON e.passage_id = p.id
    WHERE w.publication_status = 'published'
      AND w.library = '佛典'
      AND p.sequence > w.reading_start_sequence
      AND char_length(p.original_text) BETWEEN 12 AND 180
      AND p.original_text !~ 'Category:|分類:|分类:'
      AND (
        p.original_text ~ ${pattern}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(e.keywords, '[]'::jsonb)) AS keyword(value)
          WHERE keyword.value ~ ${pattern}
        )
      )
    ORDER BY md5(p.id || ${safeSeed})
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return {
    workId: String(row.work_id),
    workTitle: String(row.work_title),
    passageId: String(row.passage_id),
    sequence: Number(row.sequence),
    juan: Number(row.juan),
    quote: String(row.quote).trim(),
    sourceVerification: String(row.source_verification) as DatabaseVerificationStatus,
  }
}

export async function getPublishedPassagePage(workId: string, after = 0, limit = 30) {
  const db = sql()
  if (!db) return null
  const safeAfter = Math.max(0, Math.trunc(after))
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = await db`
    SELECT p.id, COALESCE(s.juan, 1) AS juan, p.sequence, p.original_text,
           p.content_hash, p.character_count, w.passage_count, w.reading_start_sequence,
           COALESCE(t.content, '') AS translation, t.model AS translation_model,
           to_jsonb(t)->>'origin' AS translation_origin,
           to_jsonb(t)->>'source_name' AS translation_source_name,
           to_jsonb(t)->>'contributor_name' AS translation_contributor,
           e.passage_id IS NOT NULL AS enrichment_available,
           COALESCE(e.reading_notes, '[]'::jsonb) AS reading_notes,
           COALESCE(e.keywords, '[]'::jsonb) AS keywords,
           CASE WHEN t.id IS NULL OR to_jsonb(t)->>'origin' <> 'ai' THEN '[]'::jsonb ELSE COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'index', d.segment_index, 'source', d.source_text, 'translation', d.translation_text
             ) ORDER BY d.segment_index)
             FROM translation_draft_segments d
             WHERE d.passage_id=p.id AND d.source_snapshot_hash=p.content_hash
           ), '[]'::jsonb) END AS translation_segments
    FROM works w
    JOIN passages p ON p.work_id = w.id
    LEFT JOIN work_sections s ON s.id = p.section_id
    LEFT JOIN translations t ON t.passage_id = p.id AND t.language = 'zh-Hans' AND t.status = 'published'
    LEFT JOIN passage_enrichments e ON e.passage_id = p.id
    WHERE w.id = ${workId} AND w.publication_status = 'published'
      AND p.sequence > GREATEST(${safeAfter}, w.reading_start_sequence)
    ORDER BY p.sequence
    LIMIT ${safeLimit}
  `
  if (!rows.length) {
    const existing = await db`
      SELECT passage_count, reading_start_sequence FROM works
      WHERE id = ${workId} AND publication_status = 'published'
      LIMIT 1
    `
    if (!existing[0]) return null
    return {
      passages: [] as DatabasePassage[],
      total: Math.max(0, Number(existing[0].passage_count) - Number(existing[0].reading_start_sequence)),
    }
  }
  return {
    passages: rows.map((row) => mapPassage(row)),
    total: Math.max(0, Number(rows[0].passage_count) - Number(rows[0].reading_start_sequence)),
  }
}

export async function getPublishedPassageEnrichments(workId: string, passageIds: string[]): Promise<DatabasePassageEnrichment[]> {
  const db = sql()
  if (!db) return []
  const ids = [...new Set(passageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 40)
  if (!ids.length) return []
  const rows = await db`
    SELECT e.*
    FROM passage_enrichments e
    JOIN passages p ON p.id=e.passage_id
    JOIN works w ON w.id=p.work_id
    WHERE p.work_id=${workId} AND p.id=ANY(${ids}) AND w.publication_status='published'
    ORDER BY p.sequence
  `
  return rows.map((row) => ({
    passageId: String(row.passage_id),
    sourceRecordId: String(row.source_record_id),
    titleTraditional: String(row.title_traditional),
    titleSimplified: String(row.title_simplified),
    titleIsOriginal: Boolean(row.title_is_original),
    originalTraditional: String(row.original_traditional),
    originalSimplified: String(row.original_simplified),
    originalSimplifiedPinyin: String(row.original_simplified_pinyin),
    pinyinStatus: String(row.pinyin_status),
    keywords: jsonArray(row.keywords).map(String),
    readingNotes: mapReadingNotes(row.reading_notes),
    sourceUrl: String(row.source_url),
    sourceRevisionId: String(row.source_revision_id),
    sourceLicense: String(row.source_license),
    sourceRecordHash: String(row.source_record_hash),
  }))
}

export async function getPublishedOutline(workId: string): Promise<DatabaseOutlineItem[]> {
  const db = sql()
  if (!db) return []
  const rows = await db`
    SELECT s.section_key, s.sequence,
           COALESCE(
             (to_jsonb(s)->>'end_sequence')::integer,
             LEAD(s.sequence) OVER (ORDER BY s.sequence, COALESCE((to_jsonb(s)->>'level')::integer, 1)) - 1,
             w.passage_count
           ) AS end_sequence,
           COALESCE(NULLIF(s.title, ''), '正文') AS title,
           COALESCE(to_jsonb(s)->>'kind', CASE WHEN s.title IS NULL THEN 'body' ELSE 'section' END) AS kind,
           COALESCE((to_jsonb(s)->>'level')::integer, 1) AS level,
           to_jsonb(s)->>'parent_section_key' AS parent_section_key
    FROM work_sections s
    JOIN works w ON w.id = s.work_id
    WHERE s.work_id = ${workId}
      AND w.publication_status = 'published'
      AND s.sequence > w.reading_start_sequence
    ORDER BY s.sequence, COALESCE((to_jsonb(s)->>'level')::integer, 1)
  `
  const structured = rows.map((row) => ({
    key: String(row.section_key),
    sequence: Number(row.sequence),
    endSequence: Number(row.end_sequence),
    title: String(row.title),
    kind: String(row.kind) as DatabaseOutlineItem['kind'],
    level: Number(row.level),
    parentKey: row.parent_section_key ? String(row.parent_section_key) : null,
  }))
  if (structured.some((item) => item.kind !== 'body' || item.title !== '正文')) return structured

  // Compatibility for works imported before structured work_sections existed.
  // New imports never use this path; it can be removed after the batch rebuild.
  const legacyRows = await db`
    SELECT p.id, p.sequence, split_part(p.original_text, E'\n', 1) AS title,
           w.passage_count
    FROM passages p
    JOIN works w ON w.id = p.work_id
    WHERE p.work_id = ${workId}
      AND w.publication_status = 'published'
      AND p.sequence > w.reading_start_sequence
      AND split_part(p.original_text, E'\n', 1) <> w.title
      AND char_length(split_part(p.original_text, E'\n', 1)) BETWEEN 2 AND 48
      AND split_part(p.original_text, E'\n', 1) !~ '[。！？；：,.!?;:]$'
      AND (position(E'\n' in p.original_text) > 0 OR char_length(p.original_text) <= 32)
    ORDER BY p.sequence
  `
  if (!legacyRows.length) return structured
  let volume = 0
  let chapter = 0
  let currentVolume: string | null = null
  const legacy = legacyRows.map((row) => {
    const title = String(row.title).trim()
    const isVolume = /^(?:第?[一二三四五六七八九十百千廿卅〇零两0-9]+卷|卷[一二三四五六七八九十百千廿卅〇零两0-9]+)/u.test(title)
    if (isVolume) {
      volume += 1
      chapter = 0
      currentVolume = `legacy-volume-${volume}`
      return { key: currentVolume, sequence: Number(row.sequence), title, kind: 'volume' as const, level: 1, parentKey: null }
    }
    chapter += 1
    return {
      key: `${currentVolume ?? 'legacy-root'}-chapter-${chapter}`,
      sequence: Number(row.sequence),
      title,
      kind: 'chapter' as const,
      level: currentVolume ? 2 : 1,
      parentKey: currentVolume,
    }
  })
  return legacy.map((item, index) => {
    const next = legacy.slice(index + 1).find((candidate) => candidate.level <= item.level)
    return { ...item, endSequence: (next?.sequence ?? Number(legacyRows[0].passage_count) + 1) - 1 }
  })
}

export async function contentDatabaseHealth() {
  const db = sql()
  if (!db) return { enabled: contentDatabaseEnabled(), connected: false, workCount: 0, hiddenCount: 0 }
  try {
    const [row] = await db`
      SELECT count(*)::integer AS work_count,
             count(*) FILTER (WHERE publication_status = 'hidden')::integer AS hidden_count
      FROM works
    `
    return { enabled: true, connected: true, workCount: Number(row.work_count), hiddenCount: Number(row.hidden_count) }
  } catch {
    return { enabled: true, connected: false, workCount: 0, hiddenCount: 0 }
  }
}
