'use client'

import Link from 'next/link'
import { Check, Copy, ExternalLink, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

interface ProfileSettings {
  slug: string
  bio: string
  publicEnabled: boolean
  showBio: boolean
  showContributions: boolean
  showReadingMilestones: boolean
}

export function AccountProfileSettings({ initial }: { initial: ProfileSettings }) {
  const [profile, setProfile] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'taken'>('idle')
  const [copied, setCopied] = useState(false)
  const profilePath = `/u/${profile.slug}`

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('saving')
    const response = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile),
    })
    if (response.ok) {
      const payload = await response.json() as { profile: ProfileSettings }
      setProfile(payload.profile)
      setState('saved')
      window.setTimeout(() => setState('idle'), 2200)
      return
    }
    const payload = await response.json().catch(() => null) as { error?: string } | null
    setState(payload?.error === 'slug_taken' ? 'taken' : 'error')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${profilePath}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <form className="profile-settings" onSubmit={save}>
      <section className="profile-privacy-summary" data-public={profile.publicEnabled ? 'true' : 'false'}>
        <span><ShieldCheck aria-hidden="true" /></span>
        <div>
          <strong>{profile.publicEnabled ? '个人主页已公开' : '个人主页保持私密'}</strong>
          <p>{profile.publicEnabled ? '只有你在下方开启的资料会被展示。邮箱、登录方式、收藏与划线始终不会公开。' : '只有你自己能看到账户资料、收藏、历史与划线。'}</p>
        </div>
        <label className="account-switch">
          <input type="checkbox" checked={profile.publicEnabled} onChange={(event) => setProfile((value) => ({ ...value, publicEnabled: event.target.checked }))} />
          <span aria-hidden="true" />
          <em>{profile.publicEnabled ? '已公开' : '未公开'}</em>
        </label>
      </section>

      <div className="profile-settings-grid">
        <label className="profile-field">
          <span>主页地址</span>
          <div className="profile-slug-field"><small>guanzizai.org/u/</small><input value={profile.slug} minLength={3} maxLength={32} pattern="[a-z0-9][a-z0-9-]{2,31}" onChange={(event) => setProfile((value) => ({ ...value, slug: event.target.value.toLowerCase() }))} /></div>
          <small>使用 3 至 32 位小写字母、数字或连字符。</small>
        </label>
        <label className="profile-field profile-bio-field">
          <span>个人简介</span>
          <textarea rows={4} maxLength={280} value={profile.bio} onChange={(event) => setProfile((value) => ({ ...value, bio: event.target.value }))} placeholder="写下你的阅读兴趣、整理方向或一句自我介绍。" />
          <small>{profile.bio.length} / 280</small>
        </label>
      </div>

      <fieldset className="profile-visibility-list" disabled={!profile.publicEnabled}>
        <legend>公开内容</legend>
        <label><span><strong>个人简介</strong><small>展示上方简介；未填写时保持空白。</small></span><input type="checkbox" checked={profile.showBio} onChange={(event) => setProfile((value) => ({ ...value, showBio: event.target.checked }))} /></label>
        <label><span><strong>共建作品</strong><small>只展示已采用且允许公开署名的贡献。</small></span><input type="checkbox" checked={profile.showContributions} onChange={(event) => setProfile((value) => ({ ...value, showContributions: event.target.checked }))} /></label>
        <label><span><strong>阅读里程</strong><small>只展示汇总数字，不展示具体阅读时间或书目。</small></span><input type="checkbox" checked={profile.showReadingMilestones} onChange={(event) => setProfile((value) => ({ ...value, showReadingMilestones: event.target.checked }))} /></label>
      </fieldset>

      <div className="profile-settings-footer">
        <span className="profile-private-note"><LockKeyhole aria-hidden="true" />邮箱、收藏和划线无公开开关，始终仅你可见。</span>
        <div>
          {profile.publicEnabled ? <Button type="button" size="icon" variant="outline" aria-label="复制主页链接" title="复制主页链接" onClick={() => void copyLink()}>{copied ? <Check /> : <Copy />}</Button> : null}
          {profile.publicEnabled ? <Button asChild type="button" variant="outline"><Link href={profilePath} target="_blank">预览主页 <ExternalLink /></Link></Button> : null}
          <Button type="submit" disabled={state === 'saving'}>{state === 'saving' ? <><LoaderCircle className="animate-spin" />正在保存</> : state === 'saved' ? <><Check />已保存</> : '保存设置'}</Button>
        </div>
      </div>
      {state === 'taken' ? <p className="profile-form-error">这个主页地址已被使用，请换一个。</p> : null}
      {state === 'error' ? <p className="profile-form-error">设置暂未保存，请稍后重试。</p> : null}
    </form>
  )
}
