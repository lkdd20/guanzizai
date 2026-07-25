import 'server-only'

import { type AuthUser } from '@/lib/auth'
import { ensureAccountUser } from '@/lib/account-db'
import { adminContentSql } from '@/lib/content-db'
import { type AccountBookmark, type AccountHighlight, type AccountProfileSettings } from '@/lib/account-library'

export interface ReadingHistoryItem {
  workId: string
  title: string
  sequence: number
  progressRatio: number
  totalPassages: number
  completedAt: string | null
  updatedAt: string
  activeSeconds: number
}

function iso(value: unknown) {
  return new Date(String(value)).toISOString()
}

function fallbackTitle(workId: unknown) {
  return String(workId) === 'sample-work' ? '公开版原创阅读样例' : String(workId)
}

export async function getAccountProfile(user: AuthUser) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  const [row] = await db`
    SELECT id, display_name, avatar_url, profile_bio, public_slug, profile_public,
      show_bio, show_contributions, show_reading_milestones, created_at
    FROM users WHERE id = ${account.id} LIMIT 1
  `
  if (!row) return null
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    bio: String(row.profile_bio ?? ''),
    slug: String(row.public_slug ?? ''),
    publicEnabled: Boolean(row.profile_public),
    showBio: Boolean(row.show_bio),
    showContributions: Boolean(row.show_contributions),
    showReadingMilestones: Boolean(row.show_reading_milestones),
    createdAt: iso(row.created_at),
  }
}

export async function updateAccountProfile(user: AuthUser, settings: AccountProfileSettings) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  await db`
    UPDATE users SET profile_bio = ${settings.bio || null}, public_slug = ${settings.slug},
      profile_public = ${settings.publicEnabled}, show_bio = ${settings.showBio},
      show_contributions = ${settings.showContributions},
      show_reading_milestones = ${settings.showReadingMilestones}, updated_at = now()
    WHERE id = ${account.id}
  `
  return getAccountProfile(account)
}

function mapBookmark(row: Record<string, unknown>): AccountBookmark {
  return {
    id: String(row.id),
    workId: String(row.work_id),
    workTitle: String(row.work_title || fallbackTitle(row.work_id)),
    passageId: String(row.passage_id),
    passageAnchor: String(row.passage_anchor),
    sequence: Number(row.passage_sequence),
    excerpt: String(row.excerpt),
    createdAt: iso(row.created_at),
  }
}

export async function listAccountBookmarks(user: AuthUser, limit = 100, workId?: string) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)))
  const rows = workId
    ? await db`SELECT * FROM user_bookmarks WHERE user_id = ${account.id} AND work_id = ${workId} ORDER BY created_at DESC LIMIT ${safeLimit}`
    : await db`SELECT * FROM user_bookmarks WHERE user_id = ${account.id} ORDER BY created_at DESC LIMIT ${safeLimit}`
  return rows.map((row) => mapBookmark(row))
}

export async function upsertAccountBookmark(user: AuthUser, input: Omit<AccountBookmark, 'id' | 'createdAt'>) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  const [row] = await db`
    INSERT INTO user_bookmarks (user_id, work_id, work_title, passage_id, passage_anchor, passage_sequence, excerpt)
    VALUES (${account.id}, ${input.workId}, ${input.workTitle}, ${input.passageId}, ${input.passageAnchor}, ${input.sequence}, ${input.excerpt})
    ON CONFLICT (user_id, work_id, passage_id) DO UPDATE SET
      work_title = EXCLUDED.work_title, passage_anchor = EXCLUDED.passage_anchor,
      passage_sequence = EXCLUDED.passage_sequence, excerpt = EXCLUDED.excerpt, created_at = now()
    RETURNING *
  `
  return row ? mapBookmark(row) : null
}

export async function deleteAccountBookmark(user: AuthUser, id: string) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return false
  const rows = await db`DELETE FROM user_bookmarks WHERE id = ${id} AND user_id = ${account.id} RETURNING id`
  return rows.length > 0
}

function mapHighlight(row: Record<string, unknown>): AccountHighlight {
  return {
    ...mapBookmark({ ...row, excerpt: row.selected_text }),
    contentVersion: String(row.content_version),
    selectedText: String(row.selected_text),
    contextBefore: String(row.context_before ?? ''),
    contextAfter: String(row.context_after ?? ''),
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    color: String(row.color) as AccountHighlight['color'],
  }
}

export async function listAccountHighlights(user: AuthUser, workId?: string, limit = 200) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
  const rows = workId
    ? await db`SELECT * FROM user_highlights WHERE user_id = ${account.id} AND work_id = ${workId} ORDER BY passage_sequence, created_at LIMIT ${safeLimit}`
    : await db`SELECT * FROM user_highlights WHERE user_id = ${account.id} ORDER BY created_at DESC LIMIT ${safeLimit}`
  return rows.map((row) => mapHighlight(row))
}

export async function createAccountHighlight(user: AuthUser, input: Omit<AccountHighlight, 'id' | 'createdAt' | 'excerpt'>) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return null
  const [row] = await db`
    INSERT INTO user_highlights (
      user_id, work_id, work_title, content_version, passage_id, passage_anchor,
      passage_sequence, selected_text, context_before, context_after, start_offset, end_offset, color
    ) VALUES (
      ${account.id}, ${input.workId}, ${input.workTitle}, ${input.contentVersion}, ${input.passageId},
      ${input.passageAnchor}, ${input.sequence}, ${input.selectedText}, ${input.contextBefore},
      ${input.contextAfter}, ${input.startOffset}, ${input.endOffset}, ${input.color}
    ) RETURNING *
  `
  return row ? mapHighlight(row) : null
}

export async function deleteAccountHighlight(user: AuthUser, id: string) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return false
  const rows = await db`DELETE FROM user_highlights WHERE id = ${id} AND user_id = ${account.id} RETURNING id`
  return rows.length > 0
}

export async function recordReadingActivity(user: AuthUser, workId: string, seconds: number, progressRatio: number) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return false
  await db`
    INSERT INTO reading_activity_daily (user_id, work_id, active_seconds, opened_count, max_progress_ratio)
    VALUES (${account.id}, ${workId}, ${seconds}, 1, ${progressRatio})
    ON CONFLICT (user_id, work_id, activity_date) DO UPDATE SET
      active_seconds = LEAST(86400, reading_activity_daily.active_seconds + EXCLUDED.active_seconds),
      opened_count = reading_activity_daily.opened_count + 1,
      max_progress_ratio = GREATEST(reading_activity_daily.max_progress_ratio, EXCLUDED.max_progress_ratio),
      updated_at = now()
  `
  return true
}

export async function getReadingHistory(user: AuthUser, limit = 100) {
  const account = await ensureAccountUser(user)
  const db = adminContentSql()
  if (!db) return { items: [] as ReadingHistoryItem[], stats: { averageProgress: 0, completed: 0, activeDays: 0, totalMinutes: 0 } }
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)))
  const [rows, summaryRows] = await Promise.all([
    db`
      SELECT rp.*, COALESCE(w.title, CASE WHEN rp.work_id = 'sample-work' THEN '公开版原创阅读样例' ELSE rp.work_id END) AS title,
        COALESCE((SELECT sum(active_seconds) FROM reading_activity_daily a WHERE a.user_id = rp.user_id AND a.work_id = rp.work_id), 0)::integer AS active_seconds
      FROM reading_progress rp
      LEFT JOIN works w ON w.id = rp.work_id AND w.publication_status = 'published'
      WHERE rp.user_id = ${account.id}
      ORDER BY rp.updated_at DESC LIMIT ${safeLimit}
    `,
    db`
      SELECT COALESCE(avg(progress_ratio), 0)::real AS average_progress,
        count(*) FILTER (WHERE completed_at IS NOT NULL)::integer AS completed,
        (SELECT count(DISTINCT activity_date)::integer FROM reading_activity_daily WHERE user_id = ${account.id} AND activity_date >= current_date - 6) AS active_days,
        (SELECT COALESCE(sum(active_seconds), 0)::integer FROM reading_activity_daily WHERE user_id = ${account.id}) AS active_seconds
      FROM reading_progress WHERE user_id = ${account.id}
    `,
  ])
  const summary = summaryRows[0]
  return {
    items: rows.map((row) => ({
      workId: String(row.work_id),
      title: String(row.title),
      sequence: Number(row.passage_sequence),
      progressRatio: Number(row.progress_ratio),
      totalPassages: Number(row.total_passages),
      completedAt: row.completed_at ? iso(row.completed_at) : null,
      updatedAt: iso(row.updated_at),
      activeSeconds: Number(row.active_seconds),
    })),
    stats: {
      averageProgress: Number(summary?.average_progress ?? 0),
      completed: Number(summary?.completed ?? 0),
      activeDays: Number(summary?.active_days ?? 0),
      totalMinutes: Math.round(Number(summary?.active_seconds ?? 0) / 60),
    },
  }
}

export async function getPublicProfile(slug: string) {
  const db = adminContentSql()
  if (!db) return null
  const [user] = await db`
    SELECT id, display_name, avatar_url, profile_bio, public_slug, show_bio,
      show_contributions, show_reading_milestones, created_at
    FROM users WHERE lower(public_slug) = lower(${slug}) AND profile_public = true LIMIT 1
  `
  if (!user) return null
  const result = {
    displayName: String(user.display_name),
    avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
    slug: String(user.public_slug),
    bio: Boolean(user.show_bio) ? String(user.profile_bio ?? '') : '',
    createdAt: iso(user.created_at),
    milestones: null as null | { works: number; completed: number; activeDays: number; totalMinutes: number },
    contributions: [] as Array<{ title: string; kind: string; date: string }>,
  }
  if (user.show_reading_milestones) {
    const [row] = await db`
      SELECT count(*)::integer AS works, count(*) FILTER (WHERE completed_at IS NOT NULL)::integer AS completed,
        (SELECT count(DISTINCT activity_date)::integer FROM reading_activity_daily WHERE user_id = ${user.id}) AS active_days,
        (SELECT COALESCE(sum(active_seconds), 0)::integer FROM reading_activity_daily WHERE user_id = ${user.id}) AS active_seconds
      FROM reading_progress WHERE user_id = ${user.id}
    `
    result.milestones = { works: Number(row.works), completed: Number(row.completed), activeDays: Number(row.active_days), totalMinutes: Math.round(Number(row.active_seconds) / 60) }
  }
  if (user.show_contributions) {
    const rows = await db`
      SELECT c.title, c.kind, c.submitted_at
      FROM community_contributions c
      WHERE c.public_credit = true AND c.status = 'accepted' AND c.contributor_user_id IN (
        SELECT provider_subject FROM user_identities WHERE user_id = ${user.id}
      ) ORDER BY c.submitted_at DESC LIMIT 12
    `
    result.contributions = rows.map((row) => ({ title: String(row.title), kind: String(row.kind), date: iso(row.submitted_at) }))
  }
  return result
}
