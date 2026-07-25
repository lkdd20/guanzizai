#!/usr/bin/env node

const productionBuild = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production'

if (!productionBuild) {
  console.log('production environment gate skipped outside Vercel production')
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
  console.error('Refusing to replace the working production deployment with a database-disabled build.')
  process.exit(1)
}

console.log('production environment gate passed')
