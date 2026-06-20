import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listDeals, createDeal } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listDeals(ctx.db, ctx.profile))
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.handle && !body?.pipeline_id) return NextResponse.json({ error: 'handle or pipeline_id required' }, { status: 400 })
    return NextResponse.json({ deal: await createDeal(ctx.db, ctx.profile, body) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}
