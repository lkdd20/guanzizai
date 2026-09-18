import type { MetadataRoute } from 'next'

import { siteConfig } from '@/lib/content'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ['/', '/sutras', '/read/sample-work', '/ask', '/about', '/contribute', '/updates'].map((path) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
