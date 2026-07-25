'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'

export function AccountRecord({ children, className, color, id, kind }: {
  children: ReactNode
  className: string
  color?: string
  id: string
  kind: 'bookmark' | 'highlight'
}) {
  const [removed, setRemoved] = useState(false)
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  async function remove() {
    setFailed(false)
    setRemoved(true)
    const endpoint = kind === 'bookmark' ? 'bookmarks' : 'highlights'
    try {
      const response = await fetch(`/api/me/${endpoint}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('record_delete_failed')
      router.refresh()
    } catch {
      setRemoved(false)
      setFailed(true)
    }
  }
  if (removed) return null
  return (
    <article className={className} data-color={color}>
      {children}
      <Button type="button" size="icon" variant="ghost" onClick={() => void remove()} aria-label={kind === 'bookmark' ? '删除收藏' : '删除划线'} title={kind === 'bookmark' ? '删除收藏' : '删除划线'}><Trash2 /></Button>
      {failed ? <div className="account-delete-toast" role="alert">删除失败，记录已恢复</div> : null}
    </article>
  )
}
