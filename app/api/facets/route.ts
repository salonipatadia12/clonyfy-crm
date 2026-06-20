import { NextResponse } from 'next/server'
import { requireCtx, getFacets } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getFacets(ctx.db, ctx.profile))
}
