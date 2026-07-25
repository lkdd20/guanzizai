'use client'

import type { ReactNode } from 'react'
import {
  Activity,
  BookOpenCheck,
  CalendarDays,
  FileCheck2,
  HeartHandshake,
  LayoutDashboard,
  MessageSquareText,
  Settings2,
} from 'lucide-react'
import { useState } from 'react'

interface AdminWorkspaceProps {
  children: ReactNode
}

const sections = [
  { id: 'overview', label: '总览', detail: '系统状态与待办', icon: LayoutDashboard },
  { id: 'library', label: '内容库', detail: '经目、术语与发布', icon: BookOpenCheck },
  { id: 'translation', label: '译文审核', detail: 'AI 与用户投稿', icon: FileCheck2 },
  { id: 'agent', label: 'AI 与 Agent', detail: '问答与检索', icon: MessageSquareText },
  { id: 'daily', label: '每日历签', detail: '历法与原文推荐', icon: CalendarDays },
  { id: 'support', label: '支持与运营', detail: '随喜与公开记录', icon: HeartHandshake },
  { id: 'system', label: '系统设置', detail: '权限与发布规则', icon: Settings2 },
] as const

export function AdminWorkspace({ children }: AdminWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]['id']>('overview')

  return (
    <div className="admin-workspace" data-admin-active={activeSection}>
      <aside className="admin-sidebar" aria-label="后台菜单">
        <div className="admin-sidebar-heading">
          <Activity aria-hidden="true" />
          <div>
            <strong>管理后台</strong>
            <span>观自在 Reader</span>
          </div>
        </div>
        <nav className="admin-sidebar-nav" aria-label="后台功能">
          {sections.map((section) => {
            const Icon = section.icon
            const selected = section.id === activeSection
            return (
              <button
                className={selected ? 'is-active' : undefined}
                key={section.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.detail}</small>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="admin-workspace-content">{children}</div>
    </div>
  )
}
