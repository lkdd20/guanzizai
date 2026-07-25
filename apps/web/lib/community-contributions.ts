export const communityContributionKinds = [
  'source_text',
  'translation_resource',
  'correction',
  'authorization',
  'institution',
  'bug_report',
] as const

export type CommunityContributionKind = (typeof communityContributionKinds)[number]

export function isCommunityContributionKind(value: string): value is CommunityContributionKind {
  return (communityContributionKinds as readonly string[]).includes(value)
}

export function shouldPubliclyCredit(kind: CommunityContributionKind, value: unknown) {
  if (kind === 'bug_report') return false
  return value === true || value === 'true' || value === 'on'
}
