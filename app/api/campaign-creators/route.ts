import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listCampaignCreators, bulkUpdateCampaignCreators } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => {
    const sp = req.nextUrl.searchParams
    return {
      creators: await listCampaignCreators(ctx.db, ctx.profile, {
        campaignId: sp.get('campaignId') || undefined,
        influencerId: sp.get('influencerId') || undefined,
        stage: sp.get('stage') || undefined,
        ownerId: sp.get('ownerId') || undefined,
      }),
    }
  })

/** Bulk stage / owner / follow-up change from the campaign board's selection bar. */
export const PATCH = (req: NextRequest) =>
  handle(async ctx => {
    const b = await body(req)
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : []
    const patch: Record<string, unknown> = {}
    if ('stage' in b) patch.stage = b.stage
    if ('owner_id' in b) patch.owner_id = b.owner_id
    if ('next_follow_up' in b) patch.next_follow_up = b.next_follow_up
    return bulkUpdateCampaignCreators(ctx.db, ctx.profile, ids, patch)
  })
