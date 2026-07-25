import { notFound } from 'next/navigation'

import { AdminLoginPanel } from '@/components/admin-login-panel'
import { hasValidAdminEntrySegment } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ adminEntry: string }> }) {
  const { adminEntry } = await params
  return {
    title: hasValidAdminEntrySegment(adminEntry) ? '后台登录' : '404',
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function PrivateAdminLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ adminEntry: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { adminEntry } = await params
  if (!hasValidAdminEntrySegment(adminEntry)) notFound()
  return <AdminLoginPanel searchParams={searchParams} />
}
