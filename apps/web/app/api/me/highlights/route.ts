import { NextResponse } from 'next/server'

import { createAccountHighlight, deleteAccountHighlight, listAccountHighlights } from '@/lib/account-library-db'
import { cleanSelectedText, type HighlightColor } from '@/lib/account-library'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const workId = clean(new URL(request.url).searchParams.get('workId'), 180)
  try {
    return NextResponse.json({ highlights: await listAccountHighlights(session.user, workId || undefined) }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'highlights_unavailable' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const selectedText = cleanSelectedText(body?.selectedText)
  const sequence = Number(body?.sequence)
  const startOffset = Number(body?.startOffset)
  const endOffset = Number(body?.endOffset)
  const color = ['cinnabar', 'gold', 'ink'].includes(String(body?.color)) ? String(body?.color) as HighlightColor : 'gold'
  const input = {
    workId: clean(body?.workId, 180),
    workTitle: clean(body?.workTitle, 180),
    contentVersion: clean(body?.contentVersion, 180),
    passageId: clean(body?.passageId, 180),
    passageAnchor: clean(body?.passageAnchor, 180),
    sequence: Math.trunc(sequence),
    selectedText,
    contextBefore: cleanSelectedText(body?.contextBefore, 80),
    contextAfter: cleanSelectedText(body?.contextAfter, 80),
    startOffset: Math.trunc(startOffset),
    endOffset: Math.trunc(endOffset),
    color,
  }
  if (!input.workId || !input.workTitle || !input.contentVersion || !input.passageId || !input.passageAnchor
    || selectedText.length < 2 || !Number.isFinite(sequence) || sequence <= 0 || !Number.isFinite(startOffset)
    || !Number.isFinite(endOffset) || startOffset < 0 || endOffset < startOffset || endOffset - startOffset > 1200) {
    return NextResponse.json({ error: 'invalid_highlight' }, { status: 400 })
  }
  try {
    return NextResponse.json({ highlight: await createAccountHighlight(session.user, input) }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'highlights_unavailable' }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const id = clean(new URL(request.url).searchParams.get('id'), 80)
  if (!id) return NextResponse.json({ error: 'highlight_id_required' }, { status: 400 })
  try {
    return NextResponse.json({ deleted: await deleteAccountHighlight(session.user, id) }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'highlights_unavailable' }, { status: 503 })
  }
}
