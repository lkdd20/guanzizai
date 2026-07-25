import { SiteHeader } from '@/components/site-header'

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell ask-shell">
      <SiteHeader />
      <main className="site-main ask-main">{children}</main>
    </div>
  )
}
