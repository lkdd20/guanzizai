import { redirect } from 'next/navigation'
import { Globe2, LockKeyhole } from 'lucide-react'

import { AccountProfileSettings } from '@/components/account-profile-settings'
import { getAccountProfile } from '@/lib/account-library-db'
import { getAuthSession } from '@/lib/auth'

export const metadata = { title: '公开个人主页设置', robots: { index: false, follow: false } }

export default async function AccountProfilePage() {
  const session = await getAuthSession()
  if (!session) redirect('/login?next=/account/profile')
  const profile = await getAccountProfile(session.user).catch(() => null)
  return (
    <div className="site-container account-library-page">
      <header className="account-page-head">
        <span className="account-page-icon"><Globe2 /></span>
        <div><span className="kicker">隐私与展示</span><h1>公开个人主页</h1><p>简介、共建作品和阅读里程分别授权；邮箱永不公开。</p></div>
      </header>
      {profile ? <AccountProfileSettings initial={profile} /> : <section className="account-empty"><LockKeyhole /><h2>设置暂不可用</h2><p>账户数据库连接恢复后即可设置公开主页。</p></section>}
    </div>
  )
}
