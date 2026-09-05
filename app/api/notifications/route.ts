import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listNotifications, markNotificationsRead } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listNotifications(ctx.db, ctx.profile))
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  return NextResponse.json(await markNotificationsRead(ctx.db, ctx.profile, body.ids))
}
