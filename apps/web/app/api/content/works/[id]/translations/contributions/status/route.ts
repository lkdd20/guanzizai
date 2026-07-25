import { NextResponse } from 'next/server'

import { getAuthSession } from '@/lib/auth'
import { contentSql } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ authenticated: false, submissions: [] }, { headers: { 'cache-control': 'no-store' } })
  const { id } = await params
  const db = contentSql()
  if (!db) return NextResponse.json({ authenticated: true, submissions: [] }, { headers: { 'cache-control': 'no-store' } })
  const submissions = await db`
    SELECT id, passage_id, contributor_name, source_type, source_name, status,
           review_note, submitted_at, reviewed_at
    FROM translation_contributions
    WHERE work_id = ${id} AND contributor_user_id = ${session.user.id}
    ORDER BY submitted_at DESC LIMIT 50
  `
  return NextResponse.json({ authenticated: true, submissions }, { headers: { 'cache-control': 'no-store' } })
}
