import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, updateDealVideo, deleteDealVideo } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ vid: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { vid } = await params
  try {
    return NextResponse.json({ video: await updateDealVideo(ctx.db, ctx.profile, vid, await req.json()) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ vid: string }> }) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { vid } = await params
  try {
    return NextResponse.json(await deleteDealVideo(ctx.db, ctx.profile, vid))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 400 })
  }
}
