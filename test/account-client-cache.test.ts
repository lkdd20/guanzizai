import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('account client request caches', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('shares one auth request across account controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      user: { id: 'user-id', name: '读者', email: 'reader@example.com' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadClientAuthSession } = await import('../apps/web/lib/client-auth-session')

    const [first, second] = await Promise.all([loadClientAuthSession(), loadClientAuthSession()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(first.authenticated).toBe(true)
  })

  it('shares bookmarks, highlights, and progress in one work request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      bookmarks: [],
      highlights: [],
      progress: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadClientReaderLibrary } = await import('../apps/web/lib/client-reader-library')

    await Promise.all([loadClientReaderLibrary('sample-work'), loadClientReaderLibrary('sample-work')])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/me/library?workId=sample-work', expect.objectContaining({ cache: 'no-store' }))
  })
})
