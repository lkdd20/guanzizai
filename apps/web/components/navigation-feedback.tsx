'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationFeedback() {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setPending(false)
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
  }, [pathname])

  useEffect(() => {
    function begin() {
      setPending(true)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setPending(false), 5000)
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      const destination = new URL(target.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
      begin()
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('popstate', begin)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('popstate', begin)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="route-progress" data-active={pending ? 'true' : undefined} aria-hidden="true">
      <span />
    </div>
  )
}
