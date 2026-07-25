'use client'

import Link from 'next/link'
import {
  Bookmark,
  ChevronRight,
  CircleUserRound,
  FilePenLine,
  Highlighter,
  LogOut,
  Moon,
  Clock3,
  Globe2,
  Sun,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ThemeToggle, useThemePreference } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clearClientAuthSession, loadClientAuthSession, type ClientAuthUser } from '@/lib/client-auth-session'

interface NavigationSession {
  authenticated: boolean
  user: ClientAuthUser | null
}

const readingRoutes = ['/account/favorites', '/account/history', '/account/highlights'] as const

function UserAvatar({ user, size = 'small' }: { user: ClientAuthUser; size?: 'small' | 'large' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const fallback = user.name.trim().slice(0, 1).toUpperCase() || '观'
  return (
    <span className="site-account-avatar" data-size={size} aria-hidden="true">
      {user.avatarUrl && !imageFailed ? (
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
      ) : fallback}
    </span>
  )
}

export function AccountMenu() {
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const { dark, toggleTheme } = useThemePreference()
  const router = useRouter()

  useEffect(() => {
    let active = true
    void loadClientAuthSession().then((payload) => {
      if (active) setSession(payload)
    })
    return () => { active = false }
  }, [])

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    const body = new FormData()
    body.set('next', '/')
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        body,
        credentials: 'same-origin',
      })
    } finally {
      clearClientAuthSession()
      window.location.assign('/')
    }
  }

  if (!session) {
    return (
      <div className="site-account-actions" aria-label="账户状态加载中">
        <Button variant="ghost" size="icon" type="button" disabled>
          <CircleUserRound aria-hidden="true" />
        </Button>
      </div>
    )
  }

  if (!session.authenticated || !session.user) {
    return (
      <div className="site-account-actions">
        <ThemeToggle />
        <Button asChild variant="ghost" size="icon">
          <Link href="/login?next=/account" prefetch={false} aria-label="登录">
            <CircleUserRound aria-hidden="true" />
          </Link>
        </Button>
      </div>
    )
  }

  const user = session.user

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) readingRoutes.forEach((href) => router.prefetch(href))
    }}>
      <DropdownMenuTrigger asChild>
        <Button className="site-account-trigger" variant="ghost" size="icon" type="button" aria-label={`打开${user.name}的账户菜单`}>
          <UserAvatar user={user} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="site-account-menu" align="end" sideOffset={10}>
        <DropdownMenuItem className="site-account-menu-head" asChild>
          <Link href="/account">
            <UserAvatar user={user} size="large" />
            <span>
              <strong>{user.name}</strong>
              <small>用户中心</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="site-account-menu-reading-grid" aria-label="个人阅读">
          <DropdownMenuItem className="site-account-menu-tile" asChild>
            <Link href="/account/favorites">
              <Bookmark aria-hidden="true" />
              <span>收藏</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="site-account-menu-tile" asChild>
            <Link href="/account/history">
              <Clock3 aria-hidden="true" />
              <span>历史</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="site-account-menu-tile" asChild>
            <Link href="/account/highlights">
              <Highlighter aria-hidden="true" />
              <span>划线</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="site-account-menu-secondary-grid">
          <DropdownMenuItem className="site-account-menu-secondary" asChild>
            <Link href="/account/profile">
              <Globe2 aria-hidden="true" />
              <span>个人主页</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="site-account-menu-secondary" asChild>
            <Link href="/contribute">
              <FilePenLine aria-hidden="true" />
              <span>参与共建</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="site-account-menu-footer">
          <DropdownMenuItem
            className="site-account-menu-utility"
            onSelect={(event) => {
              event.preventDefault()
              toggleTheme()
            }}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span>{dark ? '浅色外观' : '深色外观'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="site-account-menu-utility site-account-logout"
            disabled={loggingOut}
            onSelect={() => void logout()}
          >
            <LogOut aria-hidden="true" />
            <span>{loggingOut ? '正在退出…' : '退出登录'}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
