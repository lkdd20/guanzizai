import { askAgentConfigFromRuntime, askAgentTools } from '@/lib/ask-agent'
import { askAgentProfile } from '@/lib/ask-agent-profile'
import { sampleWork, sutraLibraryEntries, sutraStats, termDefinitions } from '@/lib/content'

export type AdminStatus = 'ok' | 'warn' | 'blocked'

export interface AdminSummaryCard {
  label: string
  value: string
  detail: string
  status: AdminStatus
}

export interface AdminConfigItem {
  key: string
  label: string
  configured: boolean
  detail: string
}

export interface AdminWorkflowItem {
  title: string
  status: AdminStatus
  owner: string
  detail: string
}

export interface AdminSutraProcessingItem {
  id: string
  title: string
  href: string
  overviewStatus: AdminStatus
  overviewMode: string
  overviewUpdatedAt: string
  overviewSummary: string
  characterCount: number
  estimatedReadingMinutes: number
  passageCount: number
  plainPassageCount: number
  termCount: number
  tasks: AdminWorkflowItem[]
}

export interface AdminOverview {
  generatedAt: string
  summary: AdminSummaryCard[]
  content: {
    publishedCount: number
    candidateCount: number
    passageCount: number
    termCount: number
    sourceEdition: string
    published: Array<{
      title: string
      section: string
      volume: string
      href: string
      status: string
      note: string
    }>
    candidates: Array<{
      title: string
      section: string
      status: string
      note: string
    }>
    processing: AdminSutraProcessingItem[]
  }
  ai: {
    status: AdminStatus
    mode: string
    model: string
    baseUrl: string
    configs: AdminConfigItem[]
    guardrails: string[]
  }
  agent: {
    name: string
    version: string
    status: AdminStatus
    scope: string
    tools: Array<{
      name: string
      label: string
      detail: string
    }>
    workflow: string[]
  }
  daily: {
    status: AdminStatus
    mode: string
    source: string
    fallback: string
    modelUsed: boolean
    guardrails: string[]
  }
  auth: {
    status: AdminStatus
    mode: string
    configs: AdminConfigItem[]
  }
  search: {
    status: AdminStatus
    mode: string
    configs: AdminConfigItem[]
  }
  publishing: AdminWorkflowItem[]
  audit: AdminWorkflowItem[]
}

function configured(value: string | undefined) {
  return Boolean(value && value.trim())
}

function hostFromUrl(value: string | undefined) {
  if (!value) return '默认模型网关'
  try {
    return new URL(value).host
  } catch {
    return '模型网关已设置'
  }
}

function configItem(key: string, label: string, value: string | undefined, detail: string): AdminConfigItem {
  return {
    key,
    label,
    configured: configured(value),
    detail,
  }
}

export async function getAdminOverview(now = new Date()): Promise<AdminOverview> {
  const published = sutraLibraryEntries.filter((entry) => entry.available)
  const candidates = sutraLibraryEntries.filter((entry) => !entry.available)
  const sampleStats = sutraStats(sampleWork)
  const agentConfig = await askAgentConfigFromRuntime()
  const modelKeyConfigured = configured(process.env.NEWAPI_API_KEY) || configured(process.env.DEEPSEEK_API_KEY)
  const model = agentConfig.model
  const authSessionConfigured = configured(process.env.AUTH_SESSION_SECRET)
  const oauthConfigured =
    (configured(process.env.GOOGLE_CLIENT_ID) && configured(process.env.GOOGLE_CLIENT_SECRET)) ||
    (configured(process.env.GITHUB_CLIENT_ID) && configured(process.env.GITHUB_CLIENT_SECRET))
  const smtpConfigured =
    configured(process.env.SMTP_HOST) &&
    configured(process.env.SMTP_PORT) &&
    configured(process.env.SMTP_USER) &&
    configured(process.env.SMTP_PASSWORD) &&
    configured(process.env.SMTP_FROM)
  const d1Configured = configured(process.env.PASSAGES_DB_BINDING) || configured(process.env.DATABASE_URL)
  const adminTokenConfigured = configured(process.env.ADMIN_ACCESS_TOKEN)
  const dailyDatabaseEnabled = process.env.CONTENT_DATABASE_ENABLED?.trim().toLowerCase() === 'true' && configured(process.env.DATABASE_URL)

  return {
    generatedAt: now.toISOString(),
    summary: [
      {
        label: '已上线经典',
        value: String(published.length),
        detail: `当前公开正文只来自 ${sampleWork.id}`,
        status: 'ok',
      },
      {
        label: '原文段落',
        value: String(sampleWork.passages.length),
        detail: `${sampleWork.sourceEdition} · ${sampleWork.juanCount} 卷`,
        status: 'ok',
      },
      {
        label: '术语条目',
        value: String(termDefinitions.length),
        detail: '用于阅读页词义提示',
        status: 'ok',
      },
      {
        label: '候选书目',
        value: String(candidates.length),
        detail: '未确认授权前不展示正文',
        status: candidates.length ? 'warn' : 'ok',
      },
    ],
    content: {
      publishedCount: published.length,
      candidateCount: candidates.length,
      passageCount: sampleWork.passages.length,
      termCount: termDefinitions.length,
      sourceEdition: sampleWork.sourceEdition,
      published: published.map((entry) => ({
        title: entry.title,
        section: entry.section,
        volume: entry.volume,
        href: entry.href ?? '/sutras',
        status: entry.status,
        note: entry.note,
      })),
      candidates: candidates.map((entry) => ({
        title: entry.title,
        section: entry.section,
        status: entry.status,
        note: entry.note,
      })),
      processing: [
        {
          id: sampleWork.id,
          title: sampleWork.title,
          href: `/read/${sampleWork.id}`,
          overviewStatus: sampleWork.overview.summary ? 'ok' : 'warn',
          overviewMode:
            sampleWork.overview.source === 'ai'
              ? 'AI 生成 · 人工复核'
              : sampleWork.overview.source === 'source'
                ? '底本自带说明'
                : '人工整理',
          overviewUpdatedAt: sampleWork.overview.updatedAt,
          overviewSummary: sampleWork.overview.summary,
          characterCount: sampleStats.originalCharCount,
          estimatedReadingMinutes: sampleStats.estimatedReadingMinutes,
          passageCount: sampleStats.passageCount,
          plainPassageCount: sampleStats.plainPassageCount,
          termCount: sampleStats.termCount,
          tasks: [
            {
              title: '标题下方概览',
              status: sampleWork.overview.summary ? 'ok' : 'warn',
              owner: '内容审核',
              detail: sampleWork.overview.note,
            },
            {
              title: 'AI 白话辅助',
              status: sampleStats.plainPassageCount === sampleStats.passageCount ? 'ok' : 'warn',
              owner: '内容整理',
              detail: `${sampleStats.plainPassageCount}/${sampleStats.passageCount} 段已配置；页面仍默认显示原文。`,
            },
            {
              title: '术语提示',
              status: sampleStats.termCount ? 'ok' : 'warn',
              owner: '内容整理',
              detail: `${sampleStats.termCount} 个术语已绑定到原文片段。`,
            },
            {
              title: 'RAG 检索入库',
              status: d1Configured ? 'ok' : 'warn',
              owner: '工程',
              detail: d1Configured ? '可接入 passages_fts 做问答检索。' : '未连接 D1 前，问答只使用内置原创演示片段。',
            },
          ],
        },
      ],
    },
    ai: {
      status: modelKeyConfigured ? 'ok' : 'warn',
      mode: modelKeyConfigured ? '模型问答可用' : '本地文本回答',
      model,
      baseUrl: hostFromUrl(agentConfig.baseUrl),
      configs: [
        {
          key: 'NEWAPI_API_KEY',
          label: '模型访问密钥',
          configured: modelKeyConfigured,
          detail: modelKeyConfigured ? '只在服务端读取，不返回密钥内容' : '未配置时使用本地演示文本回答',
        },
        configItem('NEWAPI_MODEL', '模型名称', process.env.NEWAPI_MODEL, '未设置时使用默认模型名'),
        configItem('NEWAPI_BASE_URL', '模型网关', process.env.NEWAPI_BASE_URL, '只展示主机名，不展示完整敏感配置'),
      ],
      guardrails: [...askAgentProfile.guardrails],
    },
    agent: {
      name: `${askAgentProfile.name} · ${askAgentProfile.role}`,
      version: askAgentProfile.version,
      status: 'ok',
      scope: askAgentProfile.currentScope,
      tools: askAgentTools(),
      workflow: [
        '问题规范化',
        '范围判断',
        '原文检索',
        '术语查找',
        '生成回答',
        '出处绑定',
        '前台 UI 可替换为独立 Agent 服务',
      ],
    },
    daily: {
      status: 'ok',
      mode: '历法计算 + 已发布原文检索',
      source: dailyDatabaseEnabled ? '已发布内容库' : '静态原创演示文本回退',
      fallback: '数据库关闭、未配置或查询失败时回退至内置原创演示段落',
      modelUsed: false,
      guardrails: [
        '同一日期全站返回同一条原文，不临时生成或改写原句',
        '数据库只检索 publication_status=published 的非宗教古籍原文',
        '阅读链接绑定作品与段落锚点，可直接回到原文核验',
        '传统历法与今日运势明确标注为文化参考，不作现实承诺',
      ],
    },
    auth: {
      status: authSessionConfigured && (oauthConfigured || smtpConfigured) && adminTokenConfigured ? 'ok' : 'warn',
      mode: authSessionConfigured ? '用户会话可用' : '会话签名未配置',
      configs: [
        configItem('AUTH_SESSION_SECRET', '会话签名密钥', process.env.AUTH_SESSION_SECRET, '用于 HttpOnly Cookie 签名'),
        {
          key: 'OAUTH_PROVIDERS',
          label: '第三方登录',
          configured: oauthConfigured,
          detail: oauthConfigured ? 'GitHub 或 Google 登录已配置' : '未配置时第三方登录按钮不可用',
        },
        {
          key: 'SMTP_LOGIN',
          label: '邮箱登录',
          configured: smtpConfigured,
          detail: smtpConfigured ? '邮箱登录链接可发送' : '未配置时邮箱登录按钮不可用',
        },
        {
          key: 'ADMIN_ACCESS_TOKEN',
          label: '后台访问保护',
          configured: adminTokenConfigured,
          detail: adminTokenConfigured ? '后台可接入访问校验' : '当前只展示无密钥状态面板',
        },
      ],
    },
    search: {
      status: d1Configured ? 'ok' : 'warn',
      mode: d1Configured ? '全文检索可接入' : '仅本地演示文本检索',
      configs: [
        {
          key: 'PASSAGES_FTS',
          label: 'D1 passages_fts',
          configured: d1Configured,
          detail: d1Configured ? '可承载全文检索与 RAG 检索片段' : '未连接 D1 前只搜索当前内置文本',
        },
      ],
    },
    publishing: [
      {
        title: '新作品入库',
        status: 'warn',
        owner: '内容审核',
        detail: '必须先确认底本、授权、译者署名和展示边界。',
      },
      {
        title: '分段与出处',
        status: 'ok',
        owner: '文本整理',
        detail: '当前原创演示文本已按段落保留稳定锚点和 sourceRef。',
      },
      {
        title: '问答检索',
        status: d1Configured ? 'ok' : 'warn',
        owner: '工程',
        detail: d1Configured ? '可接入 passages_fts 输出检索片段。' : '接入 D1 后再扩大问答范围。',
      },
      {
        title: '上线发布',
        status: 'ok',
        owner: '工程',
        detail: '发布前继续执行 typecheck、test、build。',
      },
    ],
    audit: [
      {
        title: '密钥不入库',
        status: 'ok',
        owner: '工程',
        detail: '模型、OAuth、会话和后台访问密钥只通过环境变量配置。',
      },
      {
        title: '授权边界',
        status: candidates.length ? 'warn' : 'ok',
        owner: '内容审核',
        detail: '候选作品只显示书目信息，不展示未确认正文。',
      },
      {
        title: 'AI 辅助标注',
        status: 'ok',
        owner: '产品',
        detail: '阅读页和问答都保留辅助性质说明，以原文为准。',
      },
      {
        title: '后台索引',
        status: 'ok',
        owner: '工程',
        detail: '后台入口已设置 noindex；固定 /admin 可配置为隐藏入口。',
      },
    ],
  }
}
