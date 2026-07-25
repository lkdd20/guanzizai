'use client'

import { useState } from 'react'
import { Bug, CheckCircle2, FileCheck2, Landmark, Languages, Paperclip, ScrollText, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { type CommunityContributionKind } from '@/lib/community-contributions'

const contributionKinds = [
  { value: 'source_text', label: '原文与版本', note: '可核验的原文、底本或整理本', icon: ScrollText },
  { value: 'translation_resource', label: '译文资源', note: '原创译文、获授权译本或合作线索', icon: Languages },
  { value: 'correction', label: '勘误与异文', note: '错字、脱文、章节或排版问题', icon: Wrench },
  { value: 'authorization', label: '授权资料', note: '权利人或机构可供本站使用的证明', icon: FileCheck2 },
  { value: 'institution', label: '机构共建', note: '图书馆、文库、研究团队或出版机构合作', icon: Landmark },
  { value: 'bug_report', label: 'Bug 反馈', note: '页面、交互、显示或功能异常', icon: Bug },
] as const

export function CommunityContributionForm({ authenticated, defaultName = '', defaultEmail = '', defaultWork = '', defaultKind = '', defaultTitle = '', defaultDescription = '' }: {
  authenticated: boolean
  defaultName?: string
  defaultEmail?: string
  defaultWork?: string
  defaultKind?: string
  defaultTitle?: string
  defaultDescription?: string
}) {
  const initialKind = contributionKinds.some((item) => item.value === defaultKind) ? defaultKind as CommunityContributionKind : 'source_text'
  const [kind, setKind] = useState<CommunityContributionKind>(initialKind)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorCode, setErrorCode] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    setErrorCode('')
    const form = new FormData(event.currentTarget)
    form.set('kind', kind)
    try {
      const fields = {
        kind,
        workTitle: form.get('workTitle'), title: form.get('title'), description: form.get('description'),
        sourceName: form.get('sourceName'), sourceUrl: form.get('sourceUrl'), licenseNote: form.get('licenseNote'),
        contributorName: form.get('contributorName'), organizationName: form.get('organizationName'), email: form.get('email'),
        publicCredit: form.get('publicCredit') === 'on',
      }
      let response: Response
      if (selectedFile) {
        const digest = await crypto.subtle.digest('SHA-256', await selectedFile.arrayBuffer())
        const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
        const signResponse = await fetch('/api/contributions/upload', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: selectedFile.name, type: selectedFile.type, size: selectedFile.size, sha256 }),
        })
        const signed = await signResponse.json().catch(() => null) as { error?: string; uploadUrl?: string; id?: string; key?: string } | null
        if (!signResponse.ok || !signed?.uploadUrl || !signed.id || !signed.key) throw new Error(signed?.error ?? 'upload_failed')
        const uploadResponse = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedFile.type || 'application/octet-stream', 'x-amz-meta-sha256': sha256 },
          body: selectedFile,
        })
        if (!uploadResponse.ok) throw new Error('upload_failed')
        response = await fetch('/api/contributions', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...fields, attachment: { id: signed.id, key: signed.key, name: selectedFile.name.normalize('NFKC').replace(/[\\/\0-\x1f\x7f]/g, '').trim().slice(-160) || 'attachment', type: selectedFile.type || 'application/octet-stream', size: selectedFile.size, sha256 } }),
        })
      } else {
        response = await fetch('/api/contributions', { method: 'POST', body: form })
      }
      const payload = await response.json().catch(() => null) as { error?: string } | null
      setState(response.ok ? 'sent' : 'error')
      if (response.ok) {
        event.currentTarget.reset()
        setSelectedFile(null)
      } else setErrorCode(payload?.error ?? 'invalid_request')
    } catch (error) {
      setState('error')
      setErrorCode(error instanceof Error ? error.message : 'network_error')
    }
  }

  if (state === 'sent') return (
    <div className="community-contribution-success" role="status">
      <CheckCircle2 />
      <h2>{kind === 'bug_report' ? 'Bug 反馈已提交' : '资料已进入后台审核'}</h2>
      <p>{kind === 'bug_report' ? '我们会根据复现信息定位问题。你的姓名和联系邮箱不会公开展示。' : '我们会先核对来源、版本和授权边界，不会因为提交就直接上线。若被采用，将按你的选择公开署名。'}</p>
      <Button type="button" variant="outline" onClick={() => { setState('idle'); setErrorCode('') }}>{kind === 'bug_report' ? '继续提交反馈' : '继续提交资料'}</Button>
    </div>
  )

  return (
    <form className="community-contribution-form" onSubmit={submit}>
      <fieldset>
        <legend>你想贡献什么？</legend>
        <div className="community-kind-grid">
          {contributionKinds.map((item) => {
            const Icon = item.icon
            return <label data-active={kind === item.value ? 'true' : undefined} key={item.value}>
              <input type="radio" name="kind" value={item.value} checked={kind === item.value} onChange={() => setKind(item.value)} />
              <Icon /><strong>{item.label}</strong><small>{item.note}</small>
            </label>
          })}
        </div>
      </fieldset>
      <div className="community-form-grid">
        <label><span>{kind === 'bug_report' ? '出现问题的页面或功能' : '作品或资料名称'}</span><input name="workTitle" defaultValue={defaultWork} required placeholder={kind === 'bug_report' ? '例如：首页、阅读页或登录' : '例如：待授权作品名称'} /></label>
        <label><span>{kind === 'bug_report' ? 'Bug 简述' : '本次提交标题'}</span><input name="title" defaultValue={defaultTitle} required placeholder={kind === 'bug_report' ? '例如：移动端导航无法打开' : '例如：某公有领域版本全文'} /></label>
        <label><span>{kind === 'bug_report' ? '设备与浏览器（可选）' : '来源或译本名称'}</span><input name="sourceName" placeholder={kind === 'bug_report' ? '例如：iPhone · Safari 18' : '版本、文库、出版方或提供方'} /></label>
        <label><span>{kind === 'bug_report' ? '问题页面链接（可选）' : '可核对链接'}</span><input name="sourceUrl" type="url" placeholder="https://" /></label>
      </div>
      <label><span>{kind === 'bug_report' ? '复现步骤与实际结果' : '资料说明'}</span><textarea name="description" minLength={20} rows={7} required defaultValue={defaultDescription} placeholder={kind === 'bug_report' ? '请写出复现步骤、实际看到的结果，以及你期望的结果；不要提交密码、密钥或其他隐私信息。' : '说明这份资料包含什么、从哪里来、希望如何用于本站…'} /></label>
      {kind === 'bug_report' ? <input type="hidden" name="licenseNote" value="Bug 反馈，不涉及资料授权。" /> : <label><span>权利与许可说明</span><textarea name="licenseNote" minLength={8} rows={4} required placeholder="请说明公有领域、开放许可、本人原创或已获授权的依据。" /></label>}
      <div className="community-upload-panel">
        <div className="community-upload-heading"><Paperclip /><div><strong>{kind === 'bug_report' ? '截图或附加资料' : '附加资料'}</strong><small>{authenticated ? kind === 'bug_report' ? '可上传截图或相关文件，附件只供后台定位问题。' : '登录用户可上传原文、译文或版本文件，文件只供后台审核。' : '登录后可上传文件；游客可以继续提交说明和来源链接。'}</small></div></div>
        <label className="community-file-picker">
          <span>{authenticated ? '选择资料文件' : '登录后上传资料文件'}</span>
          <input name="attachment" type="file" disabled={!authenticated} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} accept=".txt,.md,.markdown,.pdf,.epub,.doc,.docx,.rtf,.odt,.json,.jsonl,.csv,.xml,.html,.htm,.fb2,.mobi,.azw,.azw3,.zip,.png,.jpg,.jpeg,.webp" />
        </label>
        {selectedFile ? <p className="community-file-meta">已选择：{selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p> : null}
        <small className="community-form-note">支持 TXT、Markdown、PDF、EPUB、DOC/DOCX、JSON、CSV、图片、FB2、MOBI、AZW、ZIP 等格式，单文件不超过 50 MB。</small>
      </div>
      <div className="community-form-grid">
        <label><span>贡献者署名</span><input name="contributorName" defaultValue={defaultName} required /></label>
        <label><span>机构名称（可选）</span><input name="organizationName" /></label>
        <label><span>联系邮箱</span><input name="email" type="email" defaultValue={defaultEmail} disabled={authenticated} required /></label>
      </div>
      {kind === 'bug_report' ? <input type="hidden" name="publicCredit" value="false" /> : <label className="community-credit-check"><input name="publicCredit" type="checkbox" defaultChecked />若资料被采用，同意在作品页、译本说明或共建名录中公开上述署名（不公开邮箱）。</label>}
      <p className="community-form-note">{kind === 'bug_report' ? '反馈只用于定位和修复问题，姓名与联系邮箱不会公开展示。' : '提交只代表进入审核。本站不自动导入、不默认认定授权，也不会把联系邮箱公开展示。'}</p>
      {state === 'error' ? <p className="read-contribution-error">{errorCode === 'file_login_required' ? '上传文件需要先登录；游客可以删除附件后提交说明和链接。' : errorCode === 'attachment_too_large' ? '文件超过 50 MB，请压缩后再提交。' : errorCode === 'attachment_type_not_allowed' ? '文件格式暂不支持，请查看上方格式列表。' : errorCode === 'attachment_storage_unavailable' ? '附件存储暂时不可用，请稍后重试或先提交来源链接。' : errorCode === 'upload_failed' ? '文件上传没有完成，请检查网络后重试。' : errorCode === 'attachment_integrity_failed' ? '文件校验没有通过，请重新选择并上传。' : '提交未完成，请检查必填内容或稍后重试。'}</p> : null}
      <Button type="submit" disabled={state === 'sending'}>{state === 'sending' ? '正在提交…' : kind === 'bug_report' ? '提交 Bug 反馈' : '提交后台审核'}</Button>
    </form>
  )
}
