import { notFound } from 'next/navigation'

import { AdminLoginPanel } from '@/components/admin-login-panel'
import { isCustomAdminPath } from '@/lib/admin-paths'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
  return {
    title: isCustomAdminPath() ? '404' : '后台登录',
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  if (isCustomAdminPath()) notFound()
  return <AdminLoginPanel searchParams={searchParams} />
}
