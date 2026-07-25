import { NextResponse } from 'next/server'

import { getAuthSession } from '@/lib/auth'
import { contentSql } from '@/lib/content-db'

export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const amount = Number(body?.amount)
  const surname = clean(body?.surname, 24)
  const nickname = clean(body?.nickname, 40)
  const message = clean(body?.message, 280)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || !nickname) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const db = contentSql()
  if (!db) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })

  await db`
    CREATE TABLE IF NOT EXISTS support_intents (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      provider text NOT NULL,
      user_email text NOT NULL,
      amount numeric(12, 2) NOT NULL CHECK (amount > 0),
      surname text,
      nickname text NOT NULL,
      message text,
      public_credit boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      confirmed_at timestamptz
    )
  `
  const [rate] = await db`
    SELECT count(*)::integer AS count FROM support_intents
    WHERE user_id = ${session.user.id} AND submitted_at > now() - interval '1 hour'
  `
  if (Number(rate?.count ?? 0) >= 6) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const id = crypto.randomUUID()
  await db`
    INSERT INTO support_intents (
      id, user_id, provider, user_email, amount, surname, nickname, message, public_credit
    ) VALUES (
      ${id}, ${session.user.id}, ${session.user.provider}, ${session.user.email}, ${amount},
      ${surname || null}, ${nickname}, ${message || null}, ${body?.publicCredit === true}
    )
  `
  return NextResponse.json({ ok: true, id }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
