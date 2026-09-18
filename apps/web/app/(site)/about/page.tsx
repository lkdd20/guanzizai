import Link from 'next/link'
import { BookCheck, CheckCircle2, Database, HeartHandshake, Languages, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export const metadata = {
  title: '可信说明',
  description: '观自在的文本来源、核验等级、译文审核和内容收录边界。',
}

const trustItems = [
  '原文与白话分开管理，原文始终优先展示。',
  '精校、抽样核验与待复核采用不同标签，不混为一种可信等级。',
  'AI 白话和用户投稿必须经过审核，草稿不会作为正式译文展示。',
  '内容可以被收录，但只有符合发布条件的作品才能公开阅读。',
]

const collectionRules = [
  {
    icon: BookCheck,
    title: '原创演示文本',
    text: '公开源码只附带少量原创虚构段落，用于展示阅读、检索、引用和审核流程，不包含真实书籍。',
  },
  {
    icon: Database,
    title: '部署者内容库',
    text: '部署者可以导入自有、公有领域或已获授权的文本。批量收录不等于人工精校，未逐字核验的作品必须持续显示「批量收录·待复核」。',
  },
  {
    icon: ShieldCheck,
    title: '公开边界',
    text: '只有来源、核验状态和发布状态均符合要求的内容才会进入精校示例和观自在问；未核验内容不作为 AI 回答依据。',
  },
  {
    icon: Languages,
    title: '白话译文',
    text: '白话译文与原文核验是两条独立流程。AI 生成或用户提交的内容只有审核发布后才会出现在对照阅读中。',
  },
]

export default function AboutPage() {
  return (
    <div className="site-container">
      <section className="section">
        <div className="section-head">
          <span className="kicker">关于观自在</span>
          <h1 className="section-title">把文本知道到什么程度，如实告诉读者。</h1>
          <p className="section-copy">
            观自在不是权威注解，也不把批量数据或 AI 内容包装成定论。每部作品的原文核验状态与译文审核状态分别记录、分别展示。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {trustItems.map((item) => (
            <div className="quiet-panel flex gap-3" key={item}>
              <CheckCircle2 className="mt-1 shrink-0 text-primary" size={18} />
              <p className="leading-8 text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="brand">
        <div className="quiet-panel grid items-center gap-8 md:grid-cols-2">
          <div className="grid min-h-64 place-items-center rounded-lg border border-border/60 bg-background/40 p-10">
            <img src="/brand-mark.svg" alt="观自在开放视环标志" width="176" height="176" />
          </div>
          <div>
            <Badge>品牌标志</Badge>
            <h2 className="mt-4 text-2xl font-bold">开放视环：在原文周围留出理解的空间。</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              标志由两条相向但不闭合的弧线组成。弧线围成视野，回应「观」；中央留白代表原文，也代表读者自行阅读、核对和理解的空间。
            </p>
            <div className="mt-5 grid gap-3">
              <p className="leading-8 text-muted-foreground"><strong className="text-foreground">不闭合</strong>：平台不把译文、AI 回答或单一版本包装成最终结论。</p>
              <p className="leading-8 text-muted-foreground"><strong className="text-foreground">两条弧线</strong>：原文与辅助理解彼此呼应，但中心始终留给原文和读者。</p>
              <p className="leading-8 text-muted-foreground"><strong className="text-foreground">暖金色</strong>：延续古籍、纸本与壁画的文脉，同时使用抽象形态适配不同类型的古籍。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="collection">
        <div className="section-head">
          <Badge>当前收录边界</Badge>
          <h2 className="section-title mt-4">不同来源，不使用同一把可信标尺。</h2>
          <p className="section-copy">
            任何导入内容都必须先确认版权或授权。公开源码中的演示文本不代表生产站点的实际藏书，生产数据库、译文和用户数据均不随仓库发布。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {collectionRules.map((rule) => {
            const Icon = rule.icon
            return (
              <article className="quiet-panel flex gap-4" key={rule.title}>
                <Icon className="mt-1 shrink-0 text-primary" size={19} aria-hidden="true" />
                <div>
                  <h3 className="font-bold">{rule.title}</h3>
                  <p className="mt-2 leading-8 text-muted-foreground">{rule.text}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section" id="contribute">
        <div className="quiet-panel community-about-panel">
          <div>
            <Badge>共建典藏</Badge>
            <h2 className="mt-4 text-2xl font-bold">你也可以帮助一部好书被更多人读到。</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              我们接受可核验的原文、版本线索、原创或已获授权的译文、勘误记录与机构合作资料。可以登录后提交，也可直接留下联系邮箱。所有内容先进入后台审核，不会自动上线。
            </p>
            <p className="mt-3 leading-8 text-muted-foreground">
              被采用的资料可按贡献者意愿，在作品页、译本说明或未来的共建名录中展示个人或机构署名。
            </p>
          </div>
          <Link className="community-about-link" href="/contribute"><HeartHandshake />提交资料或译本</Link>
        </div>
      </section>
    </div>
  )
}
