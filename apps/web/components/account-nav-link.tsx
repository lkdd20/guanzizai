'use client'

import Link from 'next/link'
import { CircleUserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { loadClientAuthSession } from '@/lib/client-auth-session'

const accountHref = '/account'
const loginHref = '/login?next=/account'

export function AccountNavLink({
  className,
  onNavigate,
  showLabel = false,
}: {
  className?: string
  onNavigate?: () => void
  showLabel?: boolean
}) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const href = authenticated ? accountHref : loginHref

  useEffect(() => {
    let active = true
    void loadClientAuthSession().then((payload) => {
      if (active) setAuthenticated(payload.authenticated)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <Link className={className} href={href} onClick={onNavigate} aria-label={authenticated ? '用户中心' : '登录'}>
      <CircleUserRound aria-hidden="true" />
      {showLabel ? '用户中心' : null}
    </Link>
  )
}
