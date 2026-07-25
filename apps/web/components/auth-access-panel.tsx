'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BookOpenText, HeartHandshake, KeyRound, ShieldCheck, UserRoundPlus } from 'lucide-react'

import { EmailLoginForm } from '@/components/email-login-form'
import { Button } from '@/components/ui/button'

type AuthMode = 'login' | 'register'

function providerLabel(provider: string) {
  if (provider === 'github') return 'GitHub'
  if (provider === 'google') return 'Google'
  if (provider === 'email') return '邮箱'
  return '第三方'
}

function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.7 3-4.3 3-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.3l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.4 14Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.4l3.3 2.7A5.9 5.9 0 0 1 12 5.9Z" />
    </svg>
  )
}

function GitHubMark() {
  return (
    <svg className="auth-github-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.5v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0C15.9 4.8 17 5 17 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .3.2.6.8.5A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  )
}

export function AuthAccessPanel({
  mode,
  next,
  error,
  provider,
  sent,
  email,
  githubReady,
  googleReady,
  emailReady,
}: {
  mode: AuthMode
  next: string
  error?: string
  provider?: string
  sent: boolean
  email?: string
  githubReady: boolean
  googleReady: boolean
  emailReady: boolean
}) {
  const router = useRouter()
  const [displayMode, setDisplayMode] = useState<AuthMode>(mode)
  const [switching, setSwitching] = useState(false)
  const registering = displayMode === 'register'
  const alternateHref = registering ? `/login?next=${encodeURIComponent(next)}` : `/register?next=${encodeURIComponent(next)}`

  useEffect(() => {
    setDisplayMode(mode)
    router.prefetch(`/login?next=${encodeURIComponent(next)}`)
    router.prefetch(`/register?next=${encodeURIComponent(next)}`)
  }, [mode, next, router])

  function switchMode(target: AuthMode) {
    if (target === displayMode || switching) return
    setSwitching(true)
    window.setTimeout(() => {
      setDisplayMode(target)
      window.history.replaceState(window.history.state, '', `/${target}?next=${encodeURIComponent(next)}`)
      window.setTimeout(() => setSwitching(false), 180)
    }, 120)
  }

  return (
    <div className="auth-page-shell" data-mode={displayMode} data-switching={switching ? 'true' : undefined}>
      <section className="auth-story" aria-label="观自在账户说明">
        <div className="auth-story-mark" aria-hidden="true"><img src="/brand-mark.svg" alt="" width="62" height="62" /></div>
        <span className="kicker">观自在 · 个人典藏</span>
        <h1>{registering ? '从一页原文开始，留下自己的阅读脉络。' : '回来继续读，书页仍在原处。'}</h1>
        <p>
          {registering
            ? '加入后可以贡献白话译文、保存阅读进度，并逐步使用收藏与个人批注。原文始终优先，账户只承载你的阅读。'
            : '登录后继续管理译文投稿与个人阅读。我们使用免密码验证，不要求你再记住一组新密码。'}
        </p>
        <div className="auth-story-points">
          <div><BookOpenText aria-hidden="true" /><span><strong>原文优先</strong><small>译文与批注始终作为辅助</small></span></div>
          <div><HeartHandshake aria-hidden="true" /><span><strong>共同整理</strong><small>贡献译文经过审核后署名展示</small></span></div>
          <div><ShieldCheck aria-hidden="true" /><span><strong>克制收集</strong><small>不公开邮箱与第三方账户标识</small></span></div>
        </div>
        <blockquote>静下心来读一段，理解自然会慢慢发生。</blockquote>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <nav className="auth-mode-switch" aria-label="账户入口">
          <button type="button" onClick={() => switchMode('login')} aria-current={!registering ? 'page' : undefined}>登录</button>
          <button type="button" onClick={() => switchMode('register')} aria-current={registering ? 'page' : undefined}>注册</button>
          <span className="auth-mode-indicator" aria-hidden="true" />
        </nav>
        <div className="auth-card-head">
          <span className="auth-card-icon" aria-hidden="true">{registering ? <UserRoundPlus /> : <KeyRound />}</span>
          <div>
            <span className="kicker">{registering ? '首次使用' : '账户登录'}</span>
            <h2 id="auth-title">{registering ? '建立个人阅读档案' : '欢迎回来'}</h2>
            <p>{registering ? '首次验证后自动建立个人档案，无需设置密码。' : '使用已绑定的方式回到你的账户。'}</p>
          </div>
        </div>

        {sent ? <div className="auth-notice is-success" role="status">验证链接已发送到 {email ? <strong>{email}</strong> : '你的邮箱'}，15 分钟内有效。</div> : null}
        {error ? <div className="auth-notice is-error" role="alert">{authErrorMessage(error, provider)}</div> : null}

        <div className="auth-oauth-grid">
          <Button asChild={googleReady} disabled={!googleReady} variant="outline" className="auth-provider-button">
            {googleReady ? <a href={`/auth/google/start?mode=${displayMode}&next=${encodeURIComponent(next)}`}><GoogleMark />{registering ? '使用 Google 创建账户' : '使用 Google 登录'}</a> : <span><GoogleMark />Google 暂未配置</span>}
          </Button>
          <Button asChild={githubReady} disabled={!githubReady} variant="outline" className="auth-provider-button">
            {githubReady ? <a href={`/auth/github/start?mode=${displayMode}&next=${encodeURIComponent(next)}`}><GitHubMark />{registering ? '使用 GitHub 创建账户' : '使用 GitHub 登录'}</a> : <span><GitHubMark />GitHub 暂未配置</span>}
          </Button>
        </div>

        <div className="auth-divider"><span>或使用邮箱</span></div>
        <EmailLoginForm emailReady={emailReady} initialEmail={email} next={next} sent={sent} mode={displayMode} />

        {registering ? <div className="auth-register-note"><ShieldCheck /><span><strong>注册后会建立什么？</strong><small>一个私有的阅读与共建档案。邮箱和第三方账户标识不会公开。</small></span></div> : null}

        <p className="auth-alternate">
          {registering ? '已经加入？' : '第一次来到这里？'} <Link href={alternateHref}>{registering ? '返回登录' : '创建账户'}</Link>
        </p>
        <p className="auth-legal">
          继续即表示同意 <Link href="/terms">服务条款</Link> 与 <Link href="/privacy">隐私政策</Link>。
        </p>
      </section>
    </div>
  )
}

function authErrorMessage(error: string, provider?: string) {
  const subject = provider ? `${providerLabel(provider)} 验证` : '账户验证'
  if (error === 'auth-not-configured') return '账户系统尚未完成会话配置，请稍后再试。'
  if (error === 'oauth-not-configured') return `${subject}尚未配置完整。`
  if (error === 'provider-not-supported') return '当前验证方式暂不支持。'
  if (error === 'oauth-denied') return `${subject}已取消。`
  if (error === 'oauth-state-invalid') return `${subject}已过期，请重新发起。`
  if (error === 'oauth-failed') return `${subject}失败，请稍后重试。`
  if (error === 'email-not-configured') return '邮箱验证尚未配置完整。'
  if (error === 'email-invalid') return '请输入有效邮箱地址。'
  if (error === 'email-token-invalid') return '邮箱验证链接无效或已过期，请重新发送。'
  return '验证未完成，请稍后重试。'
}
