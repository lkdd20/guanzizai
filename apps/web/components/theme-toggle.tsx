'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

export function useThemePreference() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains('dark'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  function toggleTheme() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('guanzizai:theme', next ? 'dark' : 'light')
    setDark(next)
  }

  return { dark, toggleTheme }
}

export function ThemeToggle() {
  const { dark, toggleTheme } = useThemePreference()

  return (
    <Button variant="ghost" size="icon" type="button" aria-label="切换主题" onClick={toggleTheme}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
