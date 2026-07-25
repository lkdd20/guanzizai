import { HeartHandshake } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { SupportPaymentPanel } from '@/components/support-payment-panel'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '支持观自在',
  description: '支持观自在继续做免费的经文阅读、出处核验、AI 白话校准与长期维护。',
}

const supportOpen = process.env.SUPPORT_OPEN?.toLowerCase() !== 'false'

export default async function SupportPage() {
  const session = await getAuthSession()
  return (
    <div className="site-container support-page">
      <section className="support-hero">
        <div className="support-hero-copy">
          <Badge className="support-status-badge" variant={supportOpen ? 'default' : 'muted'}>
            {supportOpen ? '随喜通道已开放' : '暂未开放收款'}
          </Badge>
          <h1>让读经这件事，安静地做下去。</h1>
          <p>
            你的支持会用于模型调用、服务器、文本整理与阅读体验维护。所有阅读内容仍保持免费。
          </p>
        </div>
      </section>

      <SupportPaymentPanel isOpen={supportOpen} authenticated={Boolean(session)} defaultName={session?.user.name ?? ''} />

      <section className="support-rule-panel support-rule-compact" aria-label="公开规则">
        <HeartHandshake aria-hidden="true" />
        <div>
          <h2>公开致谢由你决定</h2>
          <p>未明确同意公开时，不会展示昵称或留言；姓氏、账户邮箱和第三方账户标识始终不公开。支持意向不代表到账，核对付款后才会进入公开记录。</p>
        </div>
      </section>
    </div>
  )
}
