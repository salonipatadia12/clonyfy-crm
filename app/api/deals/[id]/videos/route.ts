import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, addDealVideo } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json({ video: await addDealVideo(ctx.db, ctx.profile, id, await req.json()) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}
