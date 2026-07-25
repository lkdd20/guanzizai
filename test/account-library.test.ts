import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import {
  cleanSelectedText,
  isAccountId,
  normalizeProfileSlug,
  readingProgressRatio,
  validProfileSlug,
} from '../apps/web/lib/account-library'

describe('account library helpers', () => {
  it('normalizes public profile slugs without accepting reserved routes', () => {
    expect(normalizeProfileSlug('  Sutra Reader !! ')).toBe('sutrareader')
    expect(normalizeProfileSlug('reader---notes')).toBe('reader-notes')
    expect(validProfileSlug('reader-notes')).toBe(true)
    expect(validProfileSlug('admin')).toBe(false)
    expect(validProfileSlug('ab')).toBe(false)
  })

  it('keeps reading progress inside a stable zero-to-one range', () => {
    expect(readingProgressRatio(1, 14)).toBe(0)
    expect(readingProgressRatio(7, 14)).toBeCloseTo(6 / 14)
    expect(readingProgressRatio(14, 14, 1)).toBe(1)
    expect(readingProgressRatio(999, 14)).toBe(1)
    expect(readingProgressRatio(1, 0)).toBe(0)
  })

  it('stores a compact readable selection instead of layout whitespace', () => {
    expect(cleanSelectedText('  晨光入窗\n\n读者展卷  ')).toBe('晨光入窗 读者展卷')
    expect(cleanSelectedText('一二三四', 3)).toBe('一二三')
  })

  it('recognizes only database UUIDs as trusted account ids', () => {
    expect(isAccountId('2f4e92cb-f9b9-4aa1-8af4-9945f6f43da2')).toBe(true)
    expect(isAccountId('github:12345')).toBe(false)
    expect(isAccountId('2f4e92cb-f9b9-0aa1-8af4-9945f6f43da2')).toBe(false)
  })
})

describe('account library migration', () => {
  it('keeps public fields opt-in and private records scoped to a user', async () => {
    const migration = await readFile('postgres/migrations/0011_account_library.sql', 'utf8')
    expect(migration).toContain('profile_public boolean NOT NULL DEFAULT false')
    expect(migration).toContain('show_contributions boolean NOT NULL DEFAULT false')
    expect(migration).toContain('show_reading_milestones boolean NOT NULL DEFAULT false')
    expect(migration).toContain('user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE')
    expect(migration).toContain('UNIQUE (user_id, work_id, passage_id)')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS user_highlights')
    expect(migration).not.toMatch(/public_email|show_email/i)
  })

  it('uses gold for personal highlights without sharing the annotation color', async () => {
    const migration = await readFile('postgres/migrations/0012_gold_reader_highlights.sql', 'utf8')
    const runner = await readFile('scripts/apply-reader-platform-migrations.mjs', 'utf8')
    expect(migration).toContain("SET color = 'gold'")
    expect(migration).toContain("SET DEFAULT 'gold'")
    expect(runner).toContain("'postgres/migrations/0012_gold_reader_highlights.sql'")
    expect(runner).toContain('pg_advisory_lock')
    expect(runner).toContain('pg_advisory_unlock')
  })
})
