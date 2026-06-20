import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listSavedLists, createSavedList } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ lists: await listSavedLists(ctx.db, ctx.profile) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  try {
    return NextResponse.json({ list: await createSavedList(ctx.db, ctx.profile, { name: body.name, filters: body.filters ?? {} }) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
