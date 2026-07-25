import 'server-only'

import { type AuthUser, normalizeEmail } from '@/lib/auth'
import { isAccountId } from '@/lib/account-library'
import { adminContentSql } from '@/lib/content-db'

export interface AccountReadingProgress {
  workId: string
  contentVersion: string
  passageId: string
  sequence: number
  intraPassageRatio: number
  readerMode: 'original' | 'plain' | 'parallel'
  writingDirection: 'horizontal' | 'vertical'
  deviceId: string
  totalPassages: number
  progressRatio: number
  updatedAt: string
}

function mapAccountReadingProgress(row: Record<string, unknown>): AccountReadingProgress {
  return {
    workId: String(row.work_id),
    contentVersion: String(row.content_version),
    passageId: String(row.passage_id),
    sequence: Number(row.passage_sequence),
    intraPassageRatio: Number(row.intra_passage_ratio),
    readerMode: String(row.reader_mode) as AccountReadingProgress['readerMode'],
    writingDirection: String(row.writing_direction) as AccountReadingProgress['writingDirection'],
    deviceId: String(row.device_id),
    totalPassages: Number(row.total_passages ?? 1),
    progressRatio: Number(row.progress_ratio ?? 0),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

export async function ensureAccountUser(user: AuthUser): Promise<AuthUser> {
  const email = normalizeEmail(user.email)
  if (isAccountId(user.id)) return { ...user, email }
  const db = adminContentSql()
  if (!db) return { ...user, email }
  const [identity] = await db`
    WITH account AS (
      INSERT INTO users (email, display_name, avatar_url)
      VALUES (${email}, ${user.name}, ${user.avatarUrl ?? null})
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        updated_at = now()
      RETURNING id
    ), profile AS (
      UPDATE users SET public_slug = 'reader-' || left(replace(users.id::text, '-', ''), 10)
      FROM account
      WHERE users.id = account.id AND (users.public_slug IS NULL OR users.public_slug = '')
      RETURNING users.id
    )
    INSERT INTO user_identities (user_id, provider, provider_subject, provider_email)
    SELECT account.id, ${user.provider}, ${user.id}, ${email} FROM account
    ON CONFLICT (provider, provider_subject) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      provider_email = EXCLUDED.provider_email,
      last_seen_at = now()
    RETURNING user_id
  `
  const accountId = String(identity.user_id)
  return { ...user, id: accountId, email }
}

export async function getAccountReadingProgress(user: AuthUser, workId: string) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  const rows = await db`
    SELECT * FROM reading_progress
    WHERE user_id = ${account.id} AND work_id = ${workId}
    LIMIT 1
  `
  const row = rows[0]
  return row ? mapAccountReadingProgress(row) : null
}

export async function saveAccountReadingProgress(user: AuthUser, progress: AccountReadingProgress) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  const rows = await db`
    INSERT INTO reading_progress (
      user_id, work_id, content_version, passage_id, passage_sequence,
      intra_passage_ratio, reader_mode, writing_direction, device_id,
      total_passages, progress_ratio, completed_at, updated_at
    ) VALUES (
      ${account.id}, ${progress.workId}, ${progress.contentVersion}, ${progress.passageId}, ${progress.sequence},
      ${progress.intraPassageRatio}, ${progress.readerMode}, ${progress.writingDirection}, ${progress.deviceId},
      ${progress.totalPassages}, ${progress.progressRatio}, ${progress.progressRatio >= 0.98 ? new Date() : null}, now()
    )
    ON CONFLICT (user_id, work_id) DO UPDATE SET
      content_version = EXCLUDED.content_version,
      passage_id = EXCLUDED.passage_id,
      passage_sequence = EXCLUDED.passage_sequence,
      intra_passage_ratio = EXCLUDED.intra_passage_ratio,
      reader_mode = EXCLUDED.reader_mode,
      writing_direction = EXCLUDED.writing_direction,
      device_id = EXCLUDED.device_id,
      total_passages = EXCLUDED.total_passages,
      progress_ratio = GREATEST(reading_progress.progress_ratio, EXCLUDED.progress_ratio),
      completed_at = COALESCE(reading_progress.completed_at, EXCLUDED.completed_at),
      updated_at = now()
    RETURNING *
  `
  return rows[0] ? mapAccountReadingProgress(rows[0]) : null
}

export async function listAccountReadingProgress(user: AuthUser, limit = 20) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = await db`
    SELECT rp.*, COALESCE(w.title, CASE WHEN rp.work_id = 'sample-work' THEN '公开版原创阅读样例' ELSE rp.work_id END) AS title
    FROM reading_progress rp
    LEFT JOIN works w ON w.id = rp.work_id AND w.publication_status = 'published'
    WHERE rp.user_id = ${account.id}
    ORDER BY rp.updated_at DESC
    LIMIT ${safeLimit}
  `
  return rows.map((row) => ({
    workId: String(row.work_id),
    title: String(row.title),
    sequence: Number(row.passage_sequence),
    totalPassages: Number(row.total_passages ?? 1),
    progressRatio: Number(row.progress_ratio ?? 0),
    readerMode: String(row.reader_mode),
    writingDirection: String(row.writing_direction),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }))
}
