import { redirect } from 'next/navigation'

import { AuthAccessPanel } from '@/components/auth-access-panel'
import { authSessionConfigured, getAuthSession, oauthProviderConfigured, safeAuthNext, smtpConfigured } from '@/lib/auth'

export const metadata = { title: '登录', robots: { index: false, follow: false } }

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const value = (key: string) => Array.isArray(params?.[key]) ? params?.[key]?.[0] : params?.[key]
  const next = safeAuthNext(value('next'))
  if (await getAuthSession()) redirect(next)
  const ready = authSessionConfigured()
  return <AuthAccessPanel mode="login" next={next} error={value('error')} provider={value('provider')} sent={value('sent') === '1'} email={value('email')} githubReady={ready && oauthProviderConfigured('github')} googleReady={ready && oauthProviderConfigured('google')} emailReady={ready && smtpConfigured()} />
}
