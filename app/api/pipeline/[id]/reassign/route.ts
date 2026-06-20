import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, reassignPipeline } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!body.toUserId) return NextResponse.json({ error: 'toUserId required' }, { status: 400 })
  try {
    return NextResponse.json(await reassignPipeline(ctx.db, ctx.profile, id, body.toUserId, body.reason))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'admin only' ? 403 : 400 })
  }
}
