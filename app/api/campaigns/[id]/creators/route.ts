import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { addCreatorsToCampaign, listCampaignCreators } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type P = { params: Promise<{ id: string }> }

export const GET = (_req: NextRequest, { params }: P) =>
  handle(async ctx => ({ creators: await listCampaignCreators(ctx.db, ctx.profile, { campaignId: (await params).id }) }))

export const POST = (req: NextRequest, { params }: P) =>
  handle(async ctx => {
    const b = await body(req)
    return addCreatorsToCampaign(ctx.db, ctx.profile, {
      campaignId: (await params).id,
      influencerIds: Array.isArray(b.influencerIds) ? b.influencerIds.map(String) : [],
      stage: b.stage ? String(b.stage) : undefined,
      ownerId: b.ownerId === null ? null : b.ownerId ? String(b.ownerId) : undefined,
      source: b.source ? String(b.source) : undefined,
    })
  })
