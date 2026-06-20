import { NextResponse } from 'next/server'
import { requireCtx, getOverview, touchLastActive } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const data = await getOverview(ctx.db, ctx.profile)
  // Mark the user active when they load their dashboard (fire-and-forget).
  void touchLastActive(ctx.db, ctx.profile)
  return NextResponse.json(data)
}
