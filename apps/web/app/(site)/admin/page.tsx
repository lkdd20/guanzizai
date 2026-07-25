import { notFound } from 'next/navigation'

import { AdminConsole } from '@/components/admin-console'
import { isCustomAdminPath } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
  return {
    title: isCustomAdminPath() ? '404' : '管理后台',
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function AdminPage() {
  if (isCustomAdminPath()) notFound()
  return <AdminConsole />
}
