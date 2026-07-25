interface ReaderOpeningStateProps {
  title?: string
  overlay?: boolean
}

export function ReaderOpeningState({ title, overlay = false }: ReaderOpeningStateProps) {
  const label = title ? `正在打开《${title}》` : '正在打开典籍'

  return (
    <div
      className="read-page read-route-loading"
      data-overlay={overlay ? 'true' : undefined}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <div className="read-route-loading-progress" />
      <div className="read-route-loading-shell">
        <aside className="read-route-loading-sidebar" aria-hidden="true">
          <span className="read-route-loading-mark" />
          <span className="read-route-loading-sidebar-title" />
          <span className="read-route-loading-sidebar-line" />
          <div className="read-route-loading-toc">
            {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
          </div>
        </aside>
        <main className="read-route-loading-main">
          <header className="read-route-loading-topbar" aria-hidden="true">
            <span />
            <span />
          </header>
          <article className="read-route-loading-paper">
            <div className="read-route-loading-copy">
              <span className="read-route-loading-kicker" />
              <span className="read-route-loading-title" />
              <span className="read-route-loading-meta" />
              <p className="read-route-loading-status">
                <strong>{label}</strong>
                <span>正在准备首屏正文</span>
              </p>
              <div className="read-route-loading-stages" aria-hidden="true">
                <span>读取作品信息</span>
                <i />
                <span>准备本书目录</span>
                <i />
                <span>准备首屏正文</span>
              </div>
              <div className="read-route-loading-paragraphs" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        </main>
      </div>
    </div>
  )
}
