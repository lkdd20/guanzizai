import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { attachmentMetadataError } from '../apps/web/lib/community-attachments'
import { isCommunityContributionKind, shouldPubliclyCredit } from '../apps/web/lib/community-contributions'

describe('community contribution kinds', () => {
  it('accepts bug reports but never exposes public credit for them', () => {
    expect(isCommunityContributionKind('bug_report')).toBe(true)
    expect(shouldPubliclyCredit('bug_report', true)).toBe(false)
    expect(shouldPubliclyCredit('source_text', 'on')).toBe(true)
  })

  it('allows screenshots as private review attachments', () => {
    expect(attachmentMetadataError({
      id: '12345678-1234-1234-1234-123456789abc',
      key: 'community-contributions/12345678-1234-1234-1234-123456789abc/bug.png',
      name: 'bug.png',
      type: 'image/png',
      size: 1024,
      sha256: 'a'.repeat(64),
    })).toBeNull()
  })

  it('ships the production constraint migration', () => {
    const migration = readFileSync('postgres/migrations/0016_bug_report_contributions.sql', 'utf8')
    const runner = readFileSync('scripts/apply-reader-platform-migrations.mjs', 'utf8')
    expect(migration).toContain("'bug_report'")
    expect(runner).toContain("'postgres/migrations/0006_community_contributions.sql'")
    expect(runner).toContain("'postgres/migrations/0008_community_contribution_attachments.sql'")
    expect(runner).toContain('0016_bug_report_contributions.sql')
  })
})
