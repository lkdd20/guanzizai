import { notFound } from 'next/navigation'

import { AdminConsole } from '@/components/admin-console'
import { hasValidAdminEntrySegment } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ adminEntry: string }> }) {
  const { adminEntry } = await params
  return {
    title: hasValidAdminEntrySegment(adminEntry) ? '管理后台' : '404',
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function PrivateAdminPage({
  params,
}: {
  params: Promise<{ adminEntry: string }>
}) {
  const { adminEntry } = await params
  if (!hasValidAdminEntrySegment(adminEntry)) notFound()
  return <AdminConsole />
}
