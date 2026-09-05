import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listAssignments, assignInfluencers } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const memberId = req.nextUrl.searchParams.get('memberId') || undefined
  return NextResponse.json({ rows: await listAssignments(ctx.db, ctx.profile, memberId) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.memberId || !Array.isArray(body.handles)) return NextResponse.json({ error: 'memberId and handles required' }, { status: 400 })
  try {
    return NextResponse.json(await assignInfluencers(ctx.db, ctx.profile, body.memberId, body.handles))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'admin only' ? 403 : 400 })
  }
}
