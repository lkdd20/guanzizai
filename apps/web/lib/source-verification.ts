import type { SourceVerification } from '@/lib/content'

export const sourceVerificationCopy: Record<
  Exclude<SourceVerification, 'verified'>,
  { label: string; description: string }
> = {
  spot_checked: {
    label: '抽样核验',
    description: '本作品原文经抽样核对，未逐字精校，如发现文字问题请反馈。',
  },
  unverified: {
    label: '批量收录·待复核',
    description: '本作品为批量收录，原文尚未核验，请谨慎引用，欢迎反馈错字。',
  },
}

export function sourceVerificationNotice(status: SourceVerification) {
  return status === 'verified' ? null : sourceVerificationCopy[status]
}
