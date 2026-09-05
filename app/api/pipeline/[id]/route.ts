import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, updatePipeline, removeFromPipeline } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const row = await updatePipeline(ctx.db, ctx.profile, id, await req.json())
    return NextResponse.json({ row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json(await removeFromPipeline(ctx.db, ctx.profile, id))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}
