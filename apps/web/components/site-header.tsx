'use client'

import Link from 'next/link'
import { Bug, LibraryBig, Menu, MessageSquareText, ShieldCheck } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { AccountMenu } from '@/components/account-menu'
import { AccountNavLink } from '@/components/account-nav-link'
import { DailyCalendarDialog } from '@/components/daily-calendar-dialog'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { siteConfig } from '@/lib/content'
import { LanguageToggle } from './language-toggle'

const navIcons = {
  '/sutras': LibraryBig,
  '/sutras#guoxue': LibraryBig,
  '/ask': MessageSquareText,
  '/about': ShieldCheck,
  '/contribute?kind=bug_report': Bug,
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="site-header">
      <div className="site-container site-header-inner">
        <Link className="site-brand" href="/" aria-label="观自在首页">
          <span className="site-brand-mark" aria-hidden="true">
            <img src="/brand-mark.svg" alt="" width="40" height="40" />
          </span>
          <span className="site-brand-text">
            <strong>观自在</strong>
            <small>经文对照阅读</small>
          </span>
        </Link>

        <nav className="site-nav" aria-label="主导航">
          {siteConfig.nav.map((item) => {
            const hrefPath = item.href.split(/[?#]/)[0]
            const active = item.href.includes('#') ? false : hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath)
            const Icon = navIcons[item.href as keyof typeof navIcons]
            return (
              <Link key={item.href} href={item.href} data-active={active ? 'true' : undefined}>
                {Icon ? <Icon aria-hidden="true" /> : null}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="site-header-actions">
          <DailyCalendarDialog />
          <LanguageToggle />
          <AccountMenu />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button className="site-mobile-trigger" variant="ghost" size="icon" aria-label="打开导航">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>观自在</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 grid gap-2" aria-label="移动端导航">
                {siteConfig.nav.map((item) => {
                  const Icon = navIcons[item.href as keyof typeof navIcons]
                  return (
                    <Link key={item.href} className="mobile-nav-link" href={item.href} onClick={() => setOpen(false)}>
                      {Icon ? <Icon aria-hidden="true" /> : null}
                      {item.label}
                    </Link>
                  )
                })}
                <Link
                  className="mobile-nav-link"
                  href="/support"
                  onClick={() => setOpen(false)}
                >
                  <ShieldCheck aria-hidden="true" />
                  支持我们
                </Link>
                <AccountNavLink
                  className="mobile-nav-link"
                  onNavigate={() => setOpen(false)}
                  showLabel
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
