import nodemailer from 'nodemailer'
import { NextResponse } from 'next/server'

import {
  authSessionConfigured,
  createEmailLoginToken,
  isLikelyEmail,
  normalizeEmail,
  safeAuthNext,
  smtpConfigured,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const form = await request.formData()
  const email = normalizeEmail(String(form.get('email') ?? ''))
  const next = safeAuthNext(String(form.get('next') ?? '/account'))
  const mode = String(form.get('mode') ?? '') === 'register' ? 'register' : 'login'

  if (!authSessionConfigured()) return redirectToEntry(request.url, 'auth-not-configured', next, mode)
  if (!smtpConfigured()) return redirectToEntry(request.url, 'email-not-configured', next, mode)
  if (!isLikelyEmail(email)) return redirectToEntry(request.url, 'email-invalid', next, mode)

  const token = await createEmailLoginToken(email, next)
  const callbackUrl = new URL('/auth/email/callback', request.url)
  callbackUrl.searchParams.set('token', token)

  const port = Number(process.env.SMTP_PORT ?? 465)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE ?? '').toLowerCase() !== 'false' && port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: mode === 'register' ? '完成加入观自在' : '观自在登录链接',
    text: [
      mode === 'register' ? '这是你加入观自在的验证链接，15 分钟内有效：' : '这是你的观自在登录链接，15 分钟内有效：',
      '',
      callbackUrl.toString(),
      '',
      '如果不是你本人操作，可以忽略这封邮件。',
    ].join('\n'),
    html: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.8;color:#2f281f">',
      `<h2 style="margin:0 0 12px">${mode === 'register' ? '加入观自在' : '观自在登录链接'}</h2>`,
      `<p>点击下面的按钮${mode === 'register' ? '完成加入' : '完成登录'}。链接 15 分钟内有效。</p>`,
      `<p><a href="${escapeHtml(callbackUrl.toString())}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#ad7a2f;color:#fff;text-decoration:none">${mode === 'register' ? '完成加入' : '登录观自在'}</a></p>`,
      `<p style="word-break:break-all;color:#6f6458">${escapeHtml(callbackUrl.toString())}</p>`,
      '<p style="color:#6f6458">如果不是你本人操作，可以忽略这封邮件。</p>',
      '</div>',
    ].join(''),
  })

  const redirectUrl = new URL(mode === 'register' ? '/register' : '/login', request.url)
  redirectUrl.searchParams.set('sent', '1')
  redirectUrl.searchParams.set('email', email)
  redirectUrl.searchParams.set('next', next)
  const response = NextResponse.redirect(redirectUrl, 303)
  response.headers.set('cache-control', 'no-store')
  return response
}

function redirectToEntry(requestUrl: string, error: string, next: string, mode: 'login' | 'register') {
  const url = new URL(mode === 'register' ? '/register' : '/login', requestUrl)
  url.searchParams.set('error', error)
  url.searchParams.set('next', next)
  const response = NextResponse.redirect(url, 303)
  response.headers.set('cache-control', 'no-store')
  return response
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
