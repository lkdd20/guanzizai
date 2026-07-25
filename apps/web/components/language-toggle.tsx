'use client'

import { Check, Languages } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  isAppLocale,
  localeChangeEvent,
  localeOptions,
  resolveInitialLocale,
  setLocalePreference,
  type AppLocale,
} from '@/lib/locale'
import { cn } from '@/lib/utils'

export function LanguageToggle() {
  const [locale, setLocale] = useState<AppLocale>('zh-Hans')

  useEffect(() => {
    setLocale(resolveInitialLocale())

    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<{ locale?: AppLocale }>).detail?.locale
      if (isAppLocale(nextLocale)) setLocale(nextLocale)
    }

    window.addEventListener(localeChangeEvent, handleLocaleChange)
    return () => window.removeEventListener(localeChangeEvent, handleLocaleChange)
  }, [])

  const activeOption = localeOptions.find((option) => option.value === locale) ?? localeOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="language-toggle" variant="ghost" size="sm" type="button" aria-label="切换简繁">
          <Languages aria-hidden="true" />
          <span>{activeOption.shortLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={10} className="language-menu">
        <div className="language-menu-head">
          <Languages aria-hidden="true" />
          <div>
            <strong>文字显示</strong>
            <span>切换全站简繁体</span>
          </div>
        </div>
        {localeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="language-menu-item"
            data-current={option.value === locale ? 'true' : 'false'}
            aria-current={option.value === locale ? 'true' : undefined}
            onClick={() => {
              setLocale(option.value)
              setLocalePreference(option.value)
            }}
          >
            <span className="language-script-mark" aria-hidden="true">
              {option.value === 'zh-Hans' ? '简' : '繁'}
            </span>
            <span className="language-menu-copy">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <span className={cn('language-check', option.value === locale && 'is-active')}>
              {option.value === locale ? <Check aria-hidden="true" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
