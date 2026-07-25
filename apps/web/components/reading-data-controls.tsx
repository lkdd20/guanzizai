'use client'

import { DatabaseZap } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { clearReaderCache } from '@/lib/reader-cache'
import { readingProgressStorageKey } from '@/lib/reading-progress'

export function ReadingDataControls() {
  const [cleared, setCleared] = useState(false)

  async function clearLocalData() {
    window.localStorage.removeItem(readingProgressStorageKey)
    await clearReaderCache()
    setCleared(true)
  }

  return (
    <div className="account-reading-data">
      <div>
        <strong>本机阅读数据</strong>
        <span>{cleared ? '本机阅读位置与章节缓存已清除。' : '阅读位置保存在本机；登录后同时同步到账号。'}</span>
      </div>
      <Button type="button" variant="secondary" size="sm" disabled={cleared} onClick={() => void clearLocalData()}>
        <DatabaseZap aria-hidden="true" />
        {cleared ? '已清除' : '清除本机数据'}
      </Button>
    </div>
  )
}
