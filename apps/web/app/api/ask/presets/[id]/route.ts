import { NextResponse } from 'next/server'

import { normalizeAskQuestion } from '@/lib/ask-agent'
import { resolveAskPreset } from '@/lib/ask-presets'

export const runtime = 'nodejs'
export const revalidate = 300

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const question = normalizeAskQuestion(new URL(request.url).searchParams.get('question'))
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

  const response = await resolveAskPreset(id, question).catch(() => undefined)
  if (!response) {
    return NextResponse.json({ error: 'preset_unavailable' }, {
      status: 409,
      headers: { 'cache-control': 'no-store' },
    })
  }

  return NextResponse.json(response, {
    headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=60' },
  })
}
