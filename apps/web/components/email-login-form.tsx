'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { LoaderCircle, Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'

const resendCooldownSeconds = 60

export function EmailLoginForm({
  emailReady,
  initialEmail,
  next,
  sent,
  mode = 'login',
}: {
  emailReady: boolean
  initialEmail?: string
  next: string
  sent: boolean
  mode?: 'login' | 'register'
}) {
  const [cooldown, setCooldown] = useState(sent ? resendCooldownSeconds : 0)

  useEffect(() => {
    if (!sent) return
    setCooldown(resendCooldownSeconds)
  }, [sent, initialEmail])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  return (
    <form
      className="admin-login-form auth-email-form"
      action="/api/auth/email/start"
      method="post"
      onSubmit={(event) => {
        if (cooldown > 0) event.preventDefault()
      }}
    >
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value={mode} />
      <label htmlFor={`${mode}-email`}>邮箱地址</label>
      <input
        id={`${mode}-email`}
        name="email"
        type="email"
        autoComplete="email"
        placeholder="name@example.com"
        defaultValue={initialEmail ?? ''}
        required
        disabled={!emailReady}
      />
      <EmailSubmitButton cooldown={cooldown} emailReady={emailReady} sent={sent} mode={mode} />
      {sent ? (
        <p className="auth-email-note">
          {cooldown > 0 ? `还没收到？请先检查垃圾邮件，${cooldown} 秒后可以重新发送。` : '还没收到？可以重新发送一封登录链接。'}
        </p>
      ) : null}
      {!emailReady ? <p>邮箱登录尚未配置完整 SMTP 与会话密钥。</p> : null}
    </form>
  )
}

function EmailSubmitButton({
  cooldown,
  emailReady,
  sent,
  mode,
}: {
  cooldown: number
  emailReady: boolean
  sent: boolean
  mode: 'login' | 'register'
}) {
  const { pending } = useFormStatus()
  const disabled = !emailReady || pending || cooldown > 0

  return (
    <Button type="submit" disabled={disabled} aria-live="polite">
      {pending ? <LoaderCircle className="admin-spin" aria-hidden="true" /> : <Mail />}
      {pending
        ? '发送中...'
        : cooldown > 0
          ? `${cooldown}s 后可重发`
          : sent
            ? '重新发送登录链接'
            : mode === 'register' ? '发送注册验证链接' : '发送登录链接'}
    </Button>
  )
}
