export default function AccountLoading() {
  return (
    <div className="site-container account-library-page account-route-loading" role="status" aria-label="正在载入账户内容">
      <header className="account-page-head">
        <span className="account-loading-block account-loading-icon" />
        <div><span className="account-loading-block account-loading-kicker" /><span className="account-loading-block account-loading-title" /><span className="account-loading-block account-loading-copy" /></div>
      </header>
      <section className="account-loading-grid">
        {Array.from({ length: 4 }, (_, index) => <span className="account-loading-block" key={index} />)}
      </section>
      <section className="account-loading-list">
        {Array.from({ length: 3 }, (_, index) => <span className="account-loading-block" key={index} />)}
      </section>
    </div>
  )
}
