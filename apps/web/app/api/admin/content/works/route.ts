import { NextResponse } from 'next/server'

import { hasAdminAccess } from '@/lib/admin-auth'
import { hasValidAdminEntry } from '@/lib/admin-paths'
import { adminContentSql, listAdminWorks } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!hasValidAdminEntry(url.searchParams.get('entry'))) return new NextResponse('Not Found', { status: 404, headers })
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'admin authorization required' }, { status: 401, headers })
  if (!adminContentSql()) return NextResponse.json({ enabled: false, works: [] }, { headers })

  try {
    const works = await listAdminWorks(Number(url.searchParams.get('limit') ?? 50), true)
    return NextResponse.json({ enabled: true, works }, { headers })
  } catch {
    return NextResponse.json({ enabled: true, works: [], error: 'content database unavailable' }, { status: 503, headers })
  }
}

const verificationStatuses = new Set(['unverified', 'reviewing', 'verified', 'rejected'])
const publicationStatuses = new Set(['hidden', 'catalog_only', 'published'])

export async function PATCH(request: Request) {
  const url = new URL(request.url)
  if (!hasValidAdminEntry(url.searchParams.get('entry'))) return new NextResponse('Not Found', { status: 404, headers })
  if (!(await hasAdminAccess())) return NextResponse.json({ error: 'admin authorization required' }, { status: 401, headers })
  if (!adminContentSql()) return NextResponse.json({ error: 'content database unavailable' }, { status: 503, headers })

  const body = await request.json().catch(() => null) as {
    id?: string
    title?: string
    author?: string
    dynasty?: string
    category?: string
    sourceEdition?: string
    sourceVerification?: string
    publicationStatus?: string
    readingStartSequence?: number
  } | null
  const id = body?.id?.trim() ?? ''
  const title = body?.title?.trim() ?? ''
  const sourceEdition = body?.sourceEdition?.trim() ?? ''
  const sourceVerification = body?.sourceVerification?.trim() ?? ''
  const publicationStatus = body?.publicationStatus?.trim() ?? ''
  const readingStartSequence = Number(body?.readingStartSequence)
  if (!id || !title || !sourceEdition || !verificationStatuses.has(sourceVerification) || !publicationStatuses.has(publicationStatus)) {
    return NextResponse.json({ error: 'invalid_work_metadata' }, { status: 400, headers })
  }
  if (!Number.isInteger(readingStartSequence) || readingStartSequence < 0) {
    return NextResponse.json({ error: 'invalid_reading_start_sequence' }, { status: 400, headers })
  }
  const db = adminContentSql()
  if (!db) return NextResponse.json({ error: 'content database unavailable' }, { status: 503, headers })
  const reviewer = '观自在后台'
  try {
    await db.begin(async (transaction) => {
      const [current] = await transaction`
        SELECT id, source_verification, publication_status FROM works WHERE id = ${id} FOR UPDATE
      `
      if (!current) throw new Error('work_not_found')
      const preservesApprovedUnverifiedPublication = String(current.publication_status) === 'published'
        && String(current.source_verification) === sourceVerification
      if (publicationStatus === 'published' && sourceVerification !== 'verified' && !preservesApprovedUnverifiedPublication) {
        throw new Error('published_requires_verified_source')
      }
      await transaction`
        UPDATE works SET
          title = ${title},
          author = ${body?.author?.trim() || null},
          dynasty = ${body?.dynasty?.trim() || null},
          category = ${body?.category?.trim() || null},
          source_edition = ${sourceEdition},
          source_verification = ${sourceVerification},
          publication_status = ${publicationStatus},
          reading_start_sequence = ${readingStartSequence},
          published_at = CASE WHEN ${publicationStatus} = 'published' THEN COALESCE(published_at, now()) ELSE NULL END
        WHERE id = ${id}
      `
      if (String(current.source_verification) !== sourceVerification) {
        await transaction`
          INSERT INTO verification_records (work_id, from_status, to_status, reviewer, note)
          VALUES (${id}, ${String(current.source_verification)}, ${sourceVerification}, ${reviewer}, '后台内容编辑')
        `
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'work_not_found') {
      return NextResponse.json({ error: 'work_not_found' }, { status: 404, headers })
    }
    if (error instanceof Error && error.message === 'published_requires_verified_source') {
      return NextResponse.json({ error: 'published_requires_verified_source' }, { status: 409, headers })
    }
    return NextResponse.json({ error: 'content_update_failed' }, { status: 500, headers })
  }
  return NextResponse.json({ ok: true }, { headers })
}
