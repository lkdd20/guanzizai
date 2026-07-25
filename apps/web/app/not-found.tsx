import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="site-container">
      <section className="section">
        <span className="kicker">页面不存在</span>
        <h1 className="section-title">这里暂时没有可公开的内容。</h1>
        <p className="section-copy">链接可能已经变更，或对应作品尚未完成授权与发布审核。</p>
        <Button asChild><Link href="/read/sample-work">打开原创阅读样例</Link></Button>
      </section>
    </main>
  )
}
