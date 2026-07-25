#!/usr/bin/env node

const productionBuild = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production'
const demoMode = process.env.GUANZIZAI_DEMO_MODE?.trim().toLowerCase() === 'true'

if (!productionBuild) {
  console.log('production environment gate skipped outside Vercel production')
  process.exit(0)
}

if (demoMode) {
  if (process.env.CONTENT_DATABASE_ENABLED?.trim().toLowerCase() === 'true') {
    console.error('production environment gate failed: GUANZIZAI_DEMO_MODE=true cannot be combined with CONTENT_DATABASE_ENABLED=true')
    process.exit(1)
  }

  console.log('production environment gate passed in explicit database-free demo mode')
  process.exit(0)
}

const required = ['DATABASE_URL', 'AUTH_SESSION_SECRET', 'ADMIN_ACCESS_TOKEN']
const missing = required.filter((key) => {
  const value = process.env[key]?.trim()
  return !value || value === '[SENSITIVE]'
})

if (process.env.CONTENT_DATABASE_ENABLED?.trim().toLowerCase() !== 'true') {
  missing.push('CONTENT_DATABASE_ENABLED=true')
}

if (missing.length) {
  console.error(`production environment gate failed: missing ${missing.join(', ')}`)
  console.error('Set GUANZIZAI_DEMO_MODE=true for an intentional database-free demo, or configure the full production environment.')
  process.exit(1)
}

console.log('production environment gate passed')
