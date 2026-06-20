import { NextResponse } from 'next/server'
import { requireCtx, getStats } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getStats(ctx.db, ctx.profile))
}
