import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, addToPipeline } from '@/lib/data'
import type { Stage } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add to pipeline (self-assign). Accepts `handles` or catalog `ids`. Returns
// { added, conflicts } — conflicts list creators already owned by a teammate.
export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  let handles: string[] = Array.isArray(body.handles) ? body.handles : []
  const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (!handles.length && ids.length) {
    const { data } = await ctx.db.from('influencers').select('handle').eq('workspace_id', ctx.profile.workspace_id).in('id', ids)
    handles = (data ?? []).map(r => r.handle)
  }
  if (!handles.length) return NextResponse.json({ error: 'handles or ids required' }, { status: 400 })

  const stage = (typeof body.stage === 'string' ? body.stage : 'prospecting') as Stage
  // "Add anyway" over a teammate's contact is admin-only (spec §4) — never trust
  // the client to set force.
  const force = !!body.force && ctx.profile.role === 'admin'
  try {
    const result = await addToPipeline(ctx.db, ctx.profile, handles, stage, { force })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
