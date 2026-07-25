import { NextResponse } from 'next/server'

import { getAccountProfile, updateAccountProfile } from '@/lib/account-library-db'
import { normalizeProfileSlug, validProfileSlug } from '@/lib/account-library'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  try {
    return NextResponse.json({ profile: await getAccountProfile(session.user) }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'profile_unavailable' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const slug = normalizeProfileSlug(body?.slug)
  const bio = typeof body?.bio === 'string' ? body.bio.trim().slice(0, 280) : ''
  if (!validProfileSlug(slug)) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })
  try {
    const profile = await updateAccountProfile(session.user, {
      slug,
      bio,
      publicEnabled: body?.publicEnabled === true,
      showBio: body?.showBio === true,
      showContributions: body?.showContributions === true,
      showReadingMilestones: body?.showReadingMilestones === true,
    })
    return NextResponse.json({ profile }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const conflict = error instanceof Error && /unique|duplicate/i.test(error.message)
    return NextResponse.json({ error: conflict ? 'slug_taken' : 'profile_unavailable' }, { status: conflict ? 409 : 503 })
  }
}
