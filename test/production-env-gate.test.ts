import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/verify-production-env.mjs')

function productionEnv(overrides: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, VERCEL: '1', VERCEL_ENV: 'production', ...overrides }
  delete env.DATABASE_URL
  delete env.AUTH_SESSION_SECRET
  delete env.ADMIN_ACCESS_TOKEN
  delete env.CONTENT_DATABASE_ENABLED
  return { ...env, ...overrides }
}

describe('Vercel production environment gate', () => {
  it('rejects a production build without the database environment', () => {
    const result = spawnSync(process.execPath, [script], { env: productionEnv(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('production environment gate failed')
  })

  it('accepts a production build with the required environment', () => {
    const result = spawnSync(process.execPath, [script], {
      env: productionEnv({
        DATABASE_URL: 'postgresql://example.invalid/database',
        AUTH_SESSION_SECRET: 'test-session-secret',
        ADMIN_ACCESS_TOKEN: 'test-admin-token',
        CONTENT_DATABASE_ENABLED: 'true',
      }),
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('production environment gate passed')
  })
})
