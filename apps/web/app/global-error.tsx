'use client'

import { Button } from '@/components/ui/button'

// 全局错误边界：当 root layout 自身抛错时使用。
// 它替换整个 <html><body>，因此必须自带最简结构，
// 不依赖 LocaleRuntime / themeScript（那些在 root layout 内，此处不可用）。
// Next 仍会注入 globals.css，所以能用到 quiet-panel / kicker 等类。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-Hans">
      <body
        // 兜底内联样式：万一 globals.css 未及时加载，也保证可读的留白底色
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f7f1e6',
          color: '#3a332b',
          fontFamily:
            '"Huiwen-mincho","Songti SC","STSong","Noto Serif CJK SC",serif',
        }}
      >
        <main className="site-container" style={{ width: '100%', maxWidth: '720px' }}>
          <section className="error-stage" aria-labelledby="global-error-title">
            <div className="quiet-panel error-card">
              <span className="kicker error-kicker">页面异常</span>

              <p className="error-quote" aria-hidden="true">
                心無罣礙
                <br />
                無有恐怖
              </p>

              <p className="error-code" aria-hidden="true">
                出错了
              </p>

              <h1 id="global-error-title" className="section-title error-title">
                整页没能正常加载。
              </h1>
              <p className="error-copy">
                这是一个较严重的错误，页面框架本身没能渲染。可以尝试重新加载；如反复出现，请稍后再来。
              </p>

              {error.digest ? <p className="error-digest">编号 {error.digest}</p> : null}

              <div className="error-actions">
                <Button onClick={reset}>重试加载</Button>
                <Button asChild variant="outline">
                  <a href="/">回首页</a>
                </Button>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  )
}
