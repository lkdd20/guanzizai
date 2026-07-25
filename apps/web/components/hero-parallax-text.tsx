'use client'

import { useEffect, useRef } from 'react'

const sampleLines = [
  '晨光入窗，读者展卷；先核出处，再观其义',
  '原文为本，释文为助；有疑则返本复核',
  '记录版本，标明来源；尊重许可，谨慎发布',
]

export function HeroParallaxText() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onScroll = () => {
      root.style.setProperty('--hero-text-shift', `${Math.min(window.scrollY * 0.08, 48)}px`)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="hero-parallax-text" aria-hidden="true" ref={rootRef}>
      {sampleLines.map((line, index) => (
        <div className="hero-text-viewport" key={line}>
          <div
            className="hero-text-strip"
            style={{ transform: `translate3d(calc(-8% + var(--hero-text-shift, 0px) * ${index % 2 ? -1 : 1}), 0, 0)` }}
          >
            <span className="hero-track-seg">{line}</span>
            <span className="hero-track-seg">{line}</span>
            <span className="hero-track-seg">{line}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
