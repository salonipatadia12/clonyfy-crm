import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listActivity } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Live activity feed (spec §6). Admin sees the whole workspace; members see
// only their own actions (enforced in listActivity).
export async function GET(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const handle = req.nextUrl.searchParams.get('handle') || undefined
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 20
  return NextResponse.json({ feed: await listActivity(ctx.db, ctx.profile, { handle, limit }) })
}
