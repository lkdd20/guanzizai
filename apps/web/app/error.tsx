'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

// 路由运行时错误边界：兜住页面渲染崩溃，提供重试。
// 套 root layout，所以可以使用全局 CSS 变量与 quiet-panel 等类。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 仅记录到控制台，不向仓库写入密钥或用户数据。
    console.error('[guanzizai] page error boundary:', error)
  }, [error])

  return (
    <main className="site-container">
      <section className="error-stage" aria-labelledby="error-boundary-title">
        <div className="quiet-panel error-card">
          <span className="kicker error-kicker">暂时不通 · 歇一歇</span>

          <p className="error-scripture" aria-hidden="true">
            暂停片刻
            <br />
            再启此页
          </p>

          <p className="error-code" aria-hidden="true">
            500
          </p>

          <h1 id="error-boundary-title" className="section-title error-title">
            这一页没渲染出来。
          </h1>
          <p className="error-copy">
            可能是内容加载或脚本临时出错。可以先重试一次；若反复出现，说明问题尚未解决，我们会在记录后继续排查。
          </p>

          {error.digest ? <p className="error-digest">编号 {error.digest}</p> : null}

          <div className="error-actions">
            <Button onClick={reset}>再试一次</Button>
            <Button asChild variant="outline">
              <a href="/">返回首页</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
