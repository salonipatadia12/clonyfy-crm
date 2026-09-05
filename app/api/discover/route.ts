import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, discoverAndInsert, apifyStatus } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Apify availability + remaining budget.
export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await apifyStatus())
}

// Scrape-on-demand: discover + enrich + add creators for a niche (admin only).
export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'admin only' }, { status: 403 })
  const body = await req.json()
  if (!body.niche) return NextResponse.json({ error: 'niche required' }, { status: 400 })
  try {
    const result = await discoverAndInsert(ctx.db, ctx.profile, {
      niche: body.niche, count: body.count, country: body.country, minFollowers: body.minFollowers,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'admin only' ? 403 : 400 })
  }
}
