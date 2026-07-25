import { describe, expect, it } from 'vitest'

import { contentJsonResponse } from '../apps/web/lib/content-response'

describe('versioned content responses', () => {
  it('returns an ETag and revalidatable cache policy', async () => {
    const response = contentJsonResponse(new Request('https://example.test/api'), { ok: true }, 'revision-a')

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toMatch(/^".+"$/)
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('returns 304 for a matching ETag', () => {
    const first = contentJsonResponse(new Request('https://example.test/api'), {}, 'revision-a')
    const request = new Request('https://example.test/api', { headers: { 'if-none-match': first.headers.get('etag') ?? '' } })
    const response = contentJsonResponse(request, { changed: false }, 'revision-a')

    expect(response.status).toBe(304)
  })
})
