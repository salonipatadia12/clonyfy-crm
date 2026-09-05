import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listPipeline, type PipelineListParams } from '@/lib/data'
import type { Stage } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const params: PipelineListParams = {
    stage: (sp.get('stage') as Stage) || undefined,
    niche: sp.get('niche') || undefined,
    country: sp.get('country') || undefined,
    assignedTo: sp.get('assignedTo') || undefined,
    search: sp.get('search') || undefined,
    campaignId: sp.get('campaignId') || undefined,
  }
  try {
    return NextResponse.json({ rows: await listPipeline(ctx.db, ctx.profile, params) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
