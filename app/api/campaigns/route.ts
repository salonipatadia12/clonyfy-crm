import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listCampaigns, createCampaign } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listCampaigns(ctx.db, ctx.profile))
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ campaign: await createCampaign(ctx.db, ctx.profile, await req.json()) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'admin only' ? 403 : 400 })
  }
}
