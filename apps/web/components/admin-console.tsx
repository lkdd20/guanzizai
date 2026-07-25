import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  FileText,
  Gauge,
  HeartHandshake,
  KeyRound,
  LibraryBig,
  MessageSquareText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { AdminSutraOverviewGenerator } from '@/components/admin-sutra-overview-generator'
import { AdminTranslationContributions } from '@/components/admin-translation-contributions'
import { AdminTranslationReview } from '@/components/admin-translation-review'
import { AdminCommunityContributions } from '@/components/admin-community-contributions'
import { AdminModelSettings } from '@/components/admin-model-settings'
import { AdminWorkManager } from '@/components/admin-work-manager'
import { AdminWorkspace } from '@/components/admin-workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { hasAdminAccess } from '@/lib/admin-auth'
import { getAdminOverview, type AdminConfigItem, type AdminStatus, type AdminWorkflowItem } from '@/lib/admin-overview'
import { adminApiPath, adminContentWorksApiPath, adminHomePath, adminLoginPath, adminSutraOverviewApiPath } from '@/lib/admin-paths'

const statusLabel: Record<AdminStatus, string> = {
  ok: '正常',
  warn: '需处理',
  blocked: '阻塞',
}

function StatusBadge({ status }: { status: AdminStatus }) {
  return (
    <Badge className={`admin-status-badge is-${status}`} variant={status === 'ok' ? 'secondary' : 'muted'}>
      <span aria-hidden="true" />
      {statusLabel[status]}
    </Badge>
  )
}

function ConfigList({ items }: { items: AdminConfigItem[] }) {
  return (
    <div className="admin-config-list">
      {items.map((item) => (
        <div className="admin-config-row" key={item.key}>
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
          <Badge className={item.configured ? 'admin-config-ok' : 'admin-config-warn'} variant="muted">
            {item.configured ? '已配置' : '未配置'}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function WorkflowList({ items }: { items: AdminWorkflowItem[] }) {
  return (
    <div className="admin-workflow-list">
      {items.map((item) => (
        <article className="admin-workflow-item" key={item.title}>
          <div className="admin-workflow-head">
            <StatusBadge status={item.status} />
            <span>{item.owner}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  )
}

export async function AdminConsole() {
  const adminPath = adminHomePath()
  if (!(await hasAdminAccess())) redirect(`${adminLoginPath()}?next=${encodeURIComponent(adminPath)}`)

  const overview = await getAdminOverview()

  return (
    <div className="site-container admin-page">
      <section className="section admin-shell">
        <div className="admin-hero">
          <div>
            <span className="kicker">管理后台</span>
            <h1 className="section-title">把收录、AI、权限和发布边界集中管理。</h1>
            <p className="section-copy">
              后台只展示可公开的状态摘要：密钥、OAuth secret、会话密钥都只在服务端读取，不进入页面和仓库。
            </p>
          </div>
          <div className="admin-hero-actions">
            <Button asChild variant="outline">
              <Link href={adminApiPath('overview')}>状态接口</Link>
            </Button>
            <Button asChild>
              <Link href="/sutras">查看藏经阁</Link>
            </Button>
            <form action={adminApiPath('logout')} method="post">
              <Button type="submit" variant="ghost">退出后台</Button>
            </form>
          </div>
        </div>

        <AdminWorkspace>
        <div className="admin-summary-grid" data-admin-section="overview" aria-label="后台总览">
          {overview.summary.map((item) => (
            <article className="admin-summary-card" key={item.label}>
              <div className="admin-summary-top">
                <span>{item.label}</span>
                <StatusBadge status={item.status} />
              </div>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="admin-dashboard">
          <section className="admin-panel admin-panel-large" data-admin-section="translation">
            <div className="admin-section-title">
              <Sparkles size={18} />
              <h2>重点古籍白话精校</h2>
            </div>
            <p className="leading-8 text-muted-foreground">
              AI 只生成逐段初译，人工可编辑并保存审校稿。译文发布必须先完成人工审校；原文核验状态独立展示。
            </p>
            <AdminTranslationReview />
          </section>
          <section className="admin-panel admin-panel-large" data-admin-section="translation">
            <div className="admin-section-title">
              <HeartHandshake size={18} />
              <h2>共建资料审核</h2>
            </div>
            <AdminCommunityContributions />
          </section>
          <section className="admin-panel admin-panel-large">
            <div className="admin-section-title">
              <MessageSquareText size={18} />
              <h2>译文投稿审核</h2>
            </div>
            <AdminTranslationContributions />
          </section>
          <section className="admin-panel admin-panel-large" data-admin-section="library">
            <div className="admin-section-title">
              <LibraryBig size={18} />
              <h2>经文内容库</h2>
            </div>
            <div className="admin-metrics-row">
              <span>{overview.content.publishedCount} 部已上线</span>
              <span>{overview.content.candidateCount} 部候选经目</span>
              <span>{overview.content.passageCount} 个稳定段落</span>
              <span>{overview.content.termCount} 个静态示范术语</span>
            </div>
            <div className="admin-content-table">
              {overview.content.published.map((item) => (
                <Link className="admin-content-row is-live" href={item.href} key={item.title}>
                  <BookOpenCheck aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.section} · {item.volume} · {item.status}
                    </span>
                    <p>{item.note}</p>
                  </div>
                </Link>
              ))}
              {overview.content.candidates.map((item) => (
                <div className="admin-content-row" key={item.title}>
                  <FileText aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.section} · {item.status}
                    </span>
                    <p>{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-panel admin-panel-large" data-admin-section="library">
            <div className="admin-section-title">
              <LibraryBig size={18} />
              <h2>批次候选数据库</h2>
            </div>
            <p className="leading-8 text-muted-foreground">
              候选作品只允许后台接口查看。公开目录、阅读页、搜索、sitemap 和观自在问只读取已发布内容。
            </p>
            <div className="admin-hero-actions mt-4">
              <Button asChild variant="outline">
                <Link href={adminContentWorksApiPath()}>查看候选数据接口</Link>
              </Button>
            </div>
            <AdminWorkManager endpoint={adminContentWorksApiPath()} />
          </section>

          <section className="admin-panel admin-panel-large" data-admin-section="library">
            <div className="admin-section-title">
              <Sparkles size={18} />
              <h2>单经概览与 AI 处理</h2>
            </div>
            <div className="admin-processing-list">
              {overview.content.processing.map((item) => (
                <article className="admin-processing-card" key={item.id}>
                  <div className="admin-processing-main">
                    <div className="admin-processing-head">
                      <div>
                        <StatusBadge status={item.overviewStatus} />
                        <h3>{item.title}</h3>
                        <p>
                          {item.overviewMode} · 更新于 {item.overviewUpdatedAt}
                        </p>
                      </div>
                      <Button asChild className="admin-fill-button" variant="outline">
                        <Link href={item.href}>查看阅读页</Link>
                      </Button>
                    </div>
                    <p className="admin-processing-summary">{item.overviewSummary}</p>
                    <div className="admin-metrics-row">
                      <span>{item.characterCount.toLocaleString('zh-CN')} 字</span>
                      <span>约 {item.estimatedReadingMinutes} 分钟</span>
                      <span>{item.passageCount} 段原文</span>
                      <span>{item.plainPassageCount} 段白话</span>
                      <span>{item.termCount} 个术语</span>
                    </div>
                    <WorkflowList items={item.tasks} />
                  </div>
                  <AdminSutraOverviewGenerator endpoint={adminSutraOverviewApiPath(item.id)} sutraTitle={item.title} />
                </article>
              ))}
            </div>
          </section>

          <section className="admin-panel" data-admin-section="agent">
            <div className="admin-section-title">
              <MessageSquareText size={18} />
              <h2>AI 问答</h2>
            </div>
            <div className="admin-service-head">
              <StatusBadge status={overview.ai.status} />
              <strong>{overview.ai.mode}</strong>
              <span>
                {overview.ai.model} · {overview.ai.baseUrl}
              </span>
            </div>
            <AdminModelSettings endpoint={adminApiPath('models')} />
            <ConfigList items={overview.ai.configs} />
            <ul className="admin-guardrail-list">
              {overview.ai.guardrails.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-panel" data-admin-section="agent">
            <div className="admin-section-title">
              <MessageSquareText size={18} />
              <h2>照心 Agent</h2>
            </div>
            <div className="admin-service-head">
              <StatusBadge status={overview.agent.status} />
              <strong>{overview.agent.name}</strong>
              <span>
                {overview.agent.version} · {overview.agent.scope}
              </span>
            </div>
            <div className="admin-agent-tools">
              {overview.agent.tools.map((tool) => (
                <div key={tool.name}>
                  <strong>{tool.label}</strong>
                  <span>{tool.detail}</span>
                </div>
              ))}
            </div>
            <div className="admin-agent-workflow">
              {overview.agent.workflow.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>

          <section className="admin-panel admin-panel-large" data-admin-section="daily">
            <div className="admin-section-title">
              <CalendarDays size={18} />
              <h2>每日历签</h2>
            </div>
            <div className="admin-service-head">
              <StatusBadge status={overview.daily.status} />
              <strong>{overview.daily.mode}</strong>
              <span>{overview.daily.source}</span>
            </div>
            <div className="admin-operations-grid">
              <div>
                <span>推荐策略</span>
                <strong>按日确定性检索</strong>
                <small>同一天全站一致，次日自动更换</small>
              </div>
              <div>
                <span>大模型</span>
                <strong>{overview.daily.modelUsed ? '已参与' : '不参与首版推荐'}</strong>
                <small>避免幻觉、延迟与逐次调用成本</small>
              </div>
              <div>
                <span>故障回退</span>
                <strong>已配置</strong>
                <small>{overview.daily.fallback}</small>
              </div>
            </div>
            <ul className="admin-guardrail-list mt-5">
              {overview.daily.guardrails.map((item) => (
                <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>
              ))}
            </ul>
            <div className="admin-hero-actions mt-4">
              <Button asChild variant="outline"><Link href="/api/daily">查看今日接口</Link></Button>
              <Button asChild variant="outline"><Link href="/">查看首页入口</Link></Button>
            </div>
          </section>

          <section className="admin-panel" data-admin-section="system">
            <div className="admin-section-title">
              <KeyRound size={18} />
              <h2>账号与权限</h2>
            </div>
            <div className="admin-service-head">
              <StatusBadge status={overview.auth.status} />
              <strong>{overview.auth.mode}</strong>
              <span>后台访问、用户中心和第三方登录的服务端配置状态。</span>
            </div>
            <ConfigList items={overview.auth.configs} />
          </section>

          <section className="admin-panel" data-admin-section="system">
            <div className="admin-section-title">
              <SearchCheck size={18} />
              <h2>检索与 RAG</h2>
            </div>
            <div className="admin-service-head">
              <StatusBadge status={overview.search.status} />
              <strong>{overview.search.mode}</strong>
              <span>全文检索接入后，问答先取片段，再交给模型生成。</span>
            </div>
            <ConfigList items={overview.search.configs} />
          </section>

          <section className="admin-panel admin-panel-large" data-admin-section="system">
            <div className="admin-section-title">
              <Gauge size={18} />
              <h2>发布流程</h2>
            </div>
            <WorkflowList items={overview.publishing} />
          </section>

          <section className="admin-panel admin-panel-large" data-admin-section="system">
            <div className="admin-section-title">
              <ShieldCheck size={18} />
              <h2>审计边界</h2>
            </div>
            <WorkflowList items={overview.audit} />
          </section>
        </div>
        <section className="admin-panel admin-panel-large admin-support-admin-panel" data-admin-section="support">
          <div className="admin-section-title">
            <HeartHandshake size={18} />
            <h2>支持与运营</h2>
          </div>
          <p className="admin-panel-intro">
            支持页的收款开关和公开记录需要由环境变量、支付流程与数据库共同控制。后台只显示状态，不在页面回显收款凭据。
          </p>
          <div className="admin-operations-grid">
            <div>
              <span>随喜通道</span>
              <strong>{process.env.SUPPORT_OPEN === 'false' ? '暂未开放' : '已开放人工收款'}</strong>
              <small>由 SUPPORT_OPEN 控制</small>
            </div>
            <div>
              <span>功德墙</span>
              <strong>人工审核后公开</strong>
              <small>当前不自动展示付款信息</small>
            </div>
            <div>
              <span>编辑入口</span>
              <strong>支持页文案在代码中维护</strong>
              <small>支付与 supporters 表接入后开放逐条管理</small>
            </div>
          </div>
          <div className="admin-hero-actions admin-support-admin-actions">
            <Button asChild variant="outline"><Link href="/support">查看支持页</Link></Button>
            <Button asChild variant="outline"><Link href="/updates">查看更新记录</Link></Button>
          </div>
        </section>
        </AdminWorkspace>

        <div className="admin-footer-note">
          <Activity aria-hidden="true" />
          <span>
            状态生成时间 <time dateTime={overview.generatedAt}>{overview.generatedAt}</time>。后台接口已设置 noindex 和 no-store。
          </span>
        </div>
      </section>
    </div>
  )
}
