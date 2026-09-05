import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, updateOwnName } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Self-service profile update (any role updates their OWN name).
export async function PATCH(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  try {
    return NextResponse.json(await updateOwnName(ctx.db, ctx.profile, body.name))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
