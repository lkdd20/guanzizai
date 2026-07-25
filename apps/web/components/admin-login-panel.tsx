import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { adminAccessConfigured, adminUsernameConfigured, safeAdminNext } from '@/lib/admin-auth'
import { adminApiPath } from '@/lib/admin-paths'

export async function AdminLoginPanel({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = safeAdminNext(Array.isArray(params?.next) ? params?.next[0] : params?.next)
  const error = Array.isArray(params?.error) ? params?.error[0] : params?.error
  const configured = adminAccessConfigured()
  const usernameRequired = adminUsernameConfigured()

  return (
    <div className="site-container">
      <section className="auth-panel quiet-panel admin-login-panel">
        <span className="kicker">管理后台</span>
        <h1 className="mt-3 text-3xl font-bold">后台访问验证</h1>
        <p className="mt-3 leading-8 text-muted-foreground">
          后台需要单独的访问密钥。密钥只从服务端环境变量读取，不进入页面、不进入仓库。
        </p>

        {!configured ? (
          <div className="admin-login-alert" role="status">
            服务器尚未配置 ADMIN_ACCESS_TOKEN，后台已锁定。请先在 Vercel 环境变量中配置后台访问密钥。
          </div>
        ) : (
          <form className="admin-login-form" action={adminApiPath('login')} method="post">
            <input type="hidden" name="next" value={next} />
            {usernameRequired ? (
              <>
                <label htmlFor="admin-username">后台账号</label>
                <input
                  id="admin-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="输入后台账号"
                  required
                />
              </>
            ) : null}
            <label htmlFor="admin-token">后台密码</label>
            <input
              id="admin-token"
              name="token"
              type="password"
              autoComplete="current-password"
              placeholder="输入后台密码"
              required
            />
            {error === 'invalid' ? <p role="alert">后台账号或密码不正确。</p> : null}
            <Button type="submit">进入后台</Button>
          </form>
        )}

        <div className="mt-6 text-sm leading-7 text-muted-foreground">
          <Link href="/">返回首页</Link>
        </div>
      </section>
    </div>
  )
}
