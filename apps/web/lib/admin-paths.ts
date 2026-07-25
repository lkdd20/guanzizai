export const defaultAdminPath = '/admin'
export const adminEntryParam = 'entry'

const reservedPaths = new Set([
  '/_next',
  '/api',
  '/auth',
  '/login',
  '/account',
  '/contribute',
  '/read',
  '/search',
  '/sutras',
  '/support',
  '/about',
  '/terms',
  '/privacy',
  '/robots.txt',
  '/sitemap.xml',
])

export function adminHomePath() {
  return normalizeAdminPath(process.env.ADMIN_ENTRY_PATH)
}

export function adminLoginPath() {
  return `${adminHomePath()}/login`
}

export function adminApiPath(action: 'login' | 'logout' | 'models' | 'overview') {
  return `/api/admin/${action}?${adminEntryParam}=${encodeURIComponent(adminHomePath())}`
}

export function adminSutraOverviewApiPath(id: string) {
  return `/api/admin/sutras/${encodeURIComponent(id)}/overview?${adminEntryParam}=${encodeURIComponent(adminHomePath())}`
}

export function adminContentWorksApiPath() {
  return `/api/admin/content/works?${adminEntryParam}=${encodeURIComponent(adminHomePath())}`
}

export function isCustomAdminPath() {
  return adminHomePath() !== defaultAdminPath
}

export function isAdminEntryPath(pathname: string) {
  const homePath = adminHomePath()
  return pathname === homePath || pathname.startsWith(`${homePath}/`)
}

export function toInternalAdminPath(pathname: string) {
  const homePath = adminHomePath()
  if (homePath === defaultAdminPath) return pathname
  const suffix = pathname.slice(homePath.length)
  return `${defaultAdminPath}${suffix || ''}`
}

export function hasValidAdminEntry(value: string | null | undefined) {
  return value === adminHomePath()
}

export function hasValidAdminEntrySegment(value: string | null | undefined) {
  return Boolean(value) && `/${value}` === adminHomePath()
}

function normalizeAdminPath(value: string | undefined) {
  const rawValue = value?.trim()
  if (!rawValue) return defaultAdminPath

  const withSlash = rawValue.startsWith('/') ? rawValue : `/${rawValue}`
  const withoutTrailingSlash = withSlash.replace(/\/+$/, '') || defaultAdminPath
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9_-]{5,80}$/.test(withoutTrailingSlash)) return defaultAdminPath
  if (reservedPaths.has(withoutTrailingSlash)) return defaultAdminPath
  if ([...reservedPaths].some((path) => withoutTrailingSlash.startsWith(`${path}/`))) return defaultAdminPath
  return withoutTrailingSlash
}
