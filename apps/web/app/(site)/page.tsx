import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  HeartHandshake,
  LibraryBig,
  MessageSquareText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { HeroParallaxText } from '@/components/hero-parallax-text'
import { MuyuStrike } from '@/components/muyu-strike'
import { heartSutra, sutraStats } from '@/lib/content'
import styles from './home-page.module.css'

const homeEntries = [
  {
    title: '原创阅读样例',
    text: '使用两段虚构文本演示原文、释文、锚点和术语功能。',
    href: '/read/sample-work',
    prefetch: false,
    label: '开始阅读',
    icon: LibraryBig,
  },
  {
    title: '观自在问',
    text: '把问题交给照心，它会先检索原文，再带出处回答。',
    href: '/ask',
    prefetch: false,
    label: '问一句',
    icon: MessageSquareText,
  },
  {
    title: '典藏',
    text: '佛典与国学共用一套目录，核验等级和开放状态分别标注。',
    href: '/sutras',
    prefetch: false,
    label: '看典籍',
    icon: LibraryBig,
  },
]

const supportFocus = [
  {
    title: '观自在问',
    text: '继续接入模型、检索和回答记录，让提问能回到原文与出处。',
    icon: MessageSquareText,
  },
  {
    title: 'AI 白话与翻译',
    text: '模型调用和人工校准都需要成本，目标是更准确、更可核验。',
    icon: Sparkles,
  },
  {
    title: '后续开发',
    text: '全文检索、术语库、多语言、更多授权文本和后台审核流程会逐步补齐。',
    icon: SearchCheck,
  },
]

export default function HomePage() {
  const stats = sutraStats(heartSutra)

  return (
    <>
      <HeroParallaxText />
      <section className="hero">
        <div className="site-container hero-inner">
          <div className="hero-copy">
            <span className="kicker">原文优先 · 出处可核验</span>
            <h1>
              读典籍，<span>先回到原文。</span>
            </h1>
            <p>
              <span className="hero-copy-desktop">
                公开源码只附原创演示文本；你可以自行导入已获授权的内容，并如实标明来源、版本和核验状态。
              </span>
              <span className="hero-copy-mobile">从原文开始读，需要时再打开白话、术语与问答。</span>
            </p>
          </div>
          <div className="hero-muyu">
            <MuyuStrike />
          </div>
          <div className="hero-action-panel">
            <div className="hero-actions">
              <Button asChild size="lg">
                <Link href="/sutras">
                  浏览典藏 <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/read/sample-work">阅读原创样例</Link>
              </Button>
            </div>
            <div className="hero-proof" aria-label="产品原则">
              <span>只上线可公开使用文本</span>
              <span>AI 解释标注辅助性质</span>
              <span>逐段保留出处定位</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`section ${styles.homeSection} ${styles.entrySection}`}>
        <div className="site-container">
          <div className="home-entry-layout">
            <Link className="home-primary-entry" href="/read/sample-work">
              <span className="kicker">功能演示</span>
              <h2>原创文本与释文对照</h2>
              <p className="section-copy">
                仓库附带的虚构文本仅用于演示，原文、人工释文与术语提示可以分节切换阅读。
              </p>
              <span className="home-primary-facts" aria-label="原创样例阅读能力">
                <span>{stats.originalCharCount.toLocaleString('zh-CN')} 字原文</span>
                <span>{stats.passageCount} 段对照</span>
                <span>原创样例</span>
              </span>
              <span className="home-entry-cta">
                开始对照阅读 <ArrowRight aria-hidden="true" />
              </span>
            </Link>

            <div className="home-entry-grid" aria-label="核心入口">
              {homeEntries.map((entry) => {
                const Icon = entry.icon
                return (
                  <Link className="home-entry-card" href={entry.href} prefetch={entry.prefetch} key={entry.title}>
                    <Icon aria-hidden="true" />
                    <strong>{entry.title}</strong>
                    <span>{entry.text}</span>
                    <em>
                      {entry.label} <ArrowRight aria-hidden="true" />
                    </em>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className={`section ${styles.homeSection} ${styles.readingSection}`}>
        <div className="site-container">
          <div className={styles.productStory}>
            <div className={styles.productStoryIntro}>
              <span className="kicker">一套完整的典籍阅读方式</span>
              <h2 className="section-title">不是把古文搬上网页，而是让每一次理解都有路径。</h2>
              <p className="section-copy">
                观自在把阅读、辅助理解与依据核验放在同一个体验里。你可以安静读原文，也可以在需要时再打开白话、术语和照心问答。
              </p>
              <div className={styles.productStoryActions}>
                <Button asChild>
                  <Link href="/sutras">
                    选择一本典籍 <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/about" prefetch={false}>了解收录原则</Link>
                </Button>
              </div>
            </div>

            <ol className={styles.productSteps} aria-label="观自在阅读流程">
              <li>
                <span className={styles.stepNumber}>01</span>
                <BookOpenText aria-hidden="true" />
                <div>
                  <h3>先把原文读舒服</h3>
                  <p>分卷目录、渐进载入、字体与行距设置，为长篇阅读保持清晰和流畅。</p>
                </div>
              </li>
              <li>
                <span className={styles.stepNumber}>02</span>
                <ShieldCheck aria-hidden="true" />
                <div>
                  <h3>清楚知道文本状态</h3>
                  <p>来源、核验等级和发布状态分别记录；待复核内容不会伪装成精校版本。</p>
                </div>
              </li>
              <li>
                <span className={styles.stepNumber}>03</span>
                <MessageSquareText aria-hidden="true" />
                <div>
                  <h3>需要时，再请照心解释</h3>
                  <p>AI 先检索已开放原文，再带依据回答；找不到证据时会明确停下。</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className={`section home-support-section ${styles.homeSection} ${styles.supportSection}`}>
        <div className="site-container">
          <div className="home-support-panel">
            <div className="home-support-copy">
              <span className="kicker">支持我们</span>
              <h2 className="section-title section-title-readable">支持不是付费墙，是把这些功能继续做下去。</h2>
              <p className="section-copy">
                观自在会保持免费阅读。随喜支持会优先投入到模型调用、AI 白话与翻译校准、检索基础设施和后续功能开发。
              </p>
              <div className="home-support-actions">
                <Button asChild>
                  <Link href="/support" prefetch={false}>
                    支持观自在 <HeartHandshake aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/updates" prefetch={false}>查看开发记录</Link>
                </Button>
              </div>
            </div>
            <div className="home-support-grid" aria-label="支持投入方向">
              {supportFocus.map((item) => {
                const Icon = item.icon
                return (
                  <article className="home-support-card" key={item.title}>
                    <Icon aria-hidden="true" />
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
