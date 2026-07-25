import { Building2, HeartHandshake, ShieldCheck, UserRoundCheck } from 'lucide-react'

import { CommunityContributionForm } from '@/components/community-contribution-form'
import { Badge } from '@/components/ui/badge'
import { getAuthSession } from '@/lib/auth'

export const metadata = { title: '共建典藏与 Bug 反馈', description: '向观自在提交可核验的原文、译文、版本、授权、勘误资料或网站 Bug。' }

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ work?: string; kind?: string; title?: string; description?: string }> }) {
  const session = await getAuthSession()
  const { work = '', kind = '', title = '', description = '' } = await searchParams
  const isBugReport = kind === 'bug_report'
  return <div className="site-container community-contribution-page">
    <section className="section community-contribution-hero">
      <Badge>{isBugReport ? 'Bug 反馈' : '共建典藏'}</Badge>
      <h1 className={`section-title${isBugReport ? ' section-title-readable' : ''}`}>{isBugReport ? '告诉我们哪里出了问题。' : '让可靠的文本与译本，被更多人看见。'}</h1>
      <p className="section-copy">{isBugReport ? '页面显示、交互或功能不符合预期时，请提交复现步骤和设备信息。反馈会进入后台处理，不会公开你的姓名或邮箱。' : '我们诚邀读者、译者、研究者、图书馆与文化机构提供来源清楚、权利明确的原文、译文和版本线索。每份资料先进后台审核，通过后才会被采用。'}</p>
      <div className="community-principles">
        <span><ShieldCheck />{isBugReport ? '进入后台处理' : '先审核，不自动上线'}</span>
        <span><UserRoundCheck />{isBugReport ? '反馈人信息不公开' : '采用后可署名'}</span>
        <span><Building2 />{isBugReport ? '支持页面与功能问题' : '支持个人与机构共建'}</span>
        <span><HeartHandshake />{isBugReport ? '帮助持续改进体验' : '长期记录贡献'}</span>
      </div>
    </section>
    <section className="section community-contribution-panel">
      <CommunityContributionForm authenticated={Boolean(session)} defaultName={session?.user.name} defaultEmail={session?.user.email} defaultWork={work.slice(0, 180)} defaultKind={kind} defaultTitle={title.slice(0, 180)} defaultDescription={description.slice(0, 1600)} />
    </section>
  </div>
}
