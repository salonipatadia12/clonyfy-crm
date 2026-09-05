import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, getInfluencerDetail } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const detail = await getInfluencerDetail(ctx.db, ctx.profile, id)
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(detail)
}
