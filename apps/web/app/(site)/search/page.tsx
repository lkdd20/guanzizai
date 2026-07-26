import Link from 'next/link'
import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchSampleWork } from '@/lib/content'

export const metadata = {
  title: '检索',
  robots: {
    index: false,
    follow: true,
  },
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params?.q
  const q = Array.isArray(raw) ? raw[0] ?? '' : raw ?? ''
  const results = searchSampleWork(q)

  return (
    <div className="site-container">
      <section className="section">
        <div className="section-head">
          <span className="kicker">检索</span>
          <h1 className="section-title">在当前已发布内容中检索。</h1>
          <p className="section-copy">当前只在已上线文本内检索，不从未授权经典中生成结果。</p>
        </div>
        <form className="quiet-panel flex flex-col gap-3 sm:flex-row" action="/search">
          <Input name="q" defaultValue={q} placeholder="输入当前内容中的词语，例如 出处、原文" />
          <Button>
            <Search /> 检索
          </Button>
        </form>

        <div className="mt-8 grid gap-3">
          {q ? (
            results.length ? (
              results.map((item) => (
                <Link href={`/read/sample-work#${item.anchorId}`} className="quiet-panel block hover:no-underline" key={item.id}>
                  <Badge variant="muted">{item.sourceRef}</Badge>
                  <p className="mt-3 text-xl leading-9">{item.original}</p>
                  <p className="mt-2 leading-8 text-muted-foreground">{item.plain}</p>
                </Link>
              ))
            ) : (
              <div className="quiet-panel">
                <p className="leading-8 text-muted-foreground">当前已上线文本中没有找到匹配内容。完整检索接入后会标注来源范围。</p>
              </div>
            )
          ) : (
            <div className="quiet-panel">
              <p className="leading-8 text-muted-foreground">输入关键词后，会在当前已上线文本内返回可定位段落。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
