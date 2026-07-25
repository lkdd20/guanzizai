'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { LogIn, QrCode, Send, WalletCards } from 'lucide-react'

import { Button } from '@/components/ui/button'

const supportAmounts = [
  { amount: 7, title: '随喜' },
  { amount: 30, title: '助行一月' },
  { amount: 90, title: '助行一季' },
  { amount: 365, title: '助行一年' },
]

interface SupportPaymentPanelProps {
  isOpen: boolean
  authenticated: boolean
  defaultName: string
}

export function SupportPaymentPanel({ isOpen, authenticated, defaultName }: SupportPaymentPanelProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [surname, setSurname] = useState('')
  const [nickname, setNickname] = useState(defaultName)
  const [message, setMessage] = useState('')
  const [publicCredit, setPublicCredit] = useState(true)
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const parsedCustomAmount = Number(customAmount)
  const validCustomAmount = Number.isFinite(parsedCustomAmount) && parsedCustomAmount > 0
  const activeAmount = useMemo(() => {
    if (!isOpen) return null
    if (validCustomAmount) return parsedCustomAmount
    return selectedAmount
  }, [isOpen, parsedCustomAmount, selectedAmount, validCustomAmount])

  async function submitSupportIntent() {
    if (!activeAmount || !nickname.trim() || submitState === 'sending') return
    setSubmitState('sending')
    const response = await fetch('/api/support/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: activeAmount,
        surname: surname.trim(),
        nickname: nickname.trim(),
        message: message.trim(),
        publicCredit,
      }),
    }).catch(() => null)
    setSubmitState(response?.ok ? 'done' : 'error')
  }

  return (
    <section className="support-payment-panel" aria-labelledby="support-payment-title">
      <div className="support-payment-head">
        <div>
          <span className="kicker">选择支持金额</span>
          <h2 id="support-payment-title">选择一份心意</h2>
          <p>一次性、自愿，不解锁内容。</p>
        </div>
        <div className={`support-payment-state ${isOpen ? 'is-open' : 'is-closed'}`}>
          <WalletCards aria-hidden="true" />
          <span>{isOpen ? '随喜通道已开放' : '暂未开放收款'}</span>
        </div>
      </div>

      <div className="support-amount-grid">
        {supportAmounts.map((item) => {
          const selected = selectedAmount === item.amount && !validCustomAmount
          return (
            <button
              aria-pressed={selected}
              className={`support-amount-card ${selected ? 'is-selected' : ''} ${isOpen ? '' : 'is-disabled'}`}
              disabled={!isOpen}
              key={item.amount}
              type="button"
              onClick={() => {
                setSelectedAmount(item.amount)
                setCustomAmount('')
              }}
            >
              <span className="support-amount-label">¥{item.amount}</span>
              <strong>{item.title}</strong>
            </button>
          )
        })}
      </div>

      <div className="support-custom-row">
        <label htmlFor="support-custom-amount">自定义金额</label>
        <div className="support-custom-input">
          <span>¥</span>
          <input
            disabled={!isOpen}
            id="support-custom-amount"
            inputMode="decimal"
            min="1"
            placeholder={isOpen ? '输入金额' : '待开放'}
            type="number"
            value={customAmount}
            onChange={(event) => {
              setCustomAmount(event.target.value)
              setSelectedAmount(null)
            }}
          />
        </div>
      </div>

      {isOpen ? (
        activeAmount ? (
          <div className="support-qr-panel">
            <div className="support-qr-copy">
              <div className="support-qr-title">
                <QrCode aria-hidden="true" />
                <span>支付渠道待部署者配置</span>
              </div>
              <p>
                公开源码不包含收款码或支付凭据。部署者必须自行配置合法的支付渠道，并在启用前完成隐私、账目和展示规则。
              </p>
            </div>
          </div>
        ) : (
          <div className="support-waiting-panel">
            <QrCode aria-hidden="true" />
            <p>请选择一个金额，配置完成的支付渠道会在此处显示。</p>
          </div>
        )
      ) : (
        <div className="support-waiting-panel">
          <QrCode aria-hidden="true" />
          <p>待支付、账目与展示规则就绪后开放。当前不收款，也不会展示收款码。</p>
        </div>
      )}

      {isOpen && activeAmount ? (
        authenticated ? (
          <section className="support-credit-form" aria-labelledby="support-credit-title">
            <div className="support-credit-head">
              <div><span className="kicker">留下支持资料</span><h3 id="support-credit-title">公开称呼与留言</h3></div>
              <small>登录用户</small>
            </div>
            <div className="support-credit-fields">
              <label><span>姓氏</span><input maxLength={24} value={surname} onChange={(event) => setSurname(event.target.value)} placeholder="仅用于核对，可不填" /></label>
              <label><span>公开昵称</span><input maxLength={40} required value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="公开显示的称呼" /></label>
              <label className="support-credit-message"><span>留言</span><textarea maxLength={280} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="想对观自在说的话，可不填" /></label>
            </div>
            <label className="support-credit-public"><input type="checkbox" checked={publicCredit} onChange={(event) => setPublicCredit(event.target.checked)} /><span>核对到账后，允许公开昵称、金额与留言</span></label>
            <div className="support-credit-actions">
              <Button type="button" onClick={submitSupportIntent} disabled={!nickname.trim() || submitState === 'sending'}><Send aria-hidden="true" />{submitState === 'sending' ? '正在保存' : '保存支持资料'}</Button>
              {submitState === 'done' ? <p role="status">已保存，核对付款后处理。</p> : null}
              {submitState === 'error' ? <p className="is-error" role="alert">保存失败，请稍后重试。</p> : null}
            </div>
          </section>
        ) : (
          <div className="support-login-prompt"><LogIn aria-hidden="true" /><div><strong>登录后可留下昵称和留言</strong><span>支持资料会进入审核队列，不会自动公开。</span></div><Button asChild size="sm"><Link href="/login?next=/support">登录</Link></Button></div>
        )
      ) : null}
    </section>
  )
}
