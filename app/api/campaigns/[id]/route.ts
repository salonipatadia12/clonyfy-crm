import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { getCampaignV2, updateCampaignV2, deleteCampaignV2, listCampaignCreators } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type P = { params: Promise<{ id: string }> }

export const GET = (_req: NextRequest, { params }: P) =>
  handle(async ctx => {
    const id = (await params).id
    const [campaign, creators] = await Promise.all([
      getCampaignV2(ctx.db, ctx.profile, id),
      listCampaignCreators(ctx.db, ctx.profile, { campaignId: id }),
    ])
    return { campaign, creators }
  })

export const PATCH = (req: NextRequest, { params }: P) =>
  handle(async ctx => ({ campaign: await updateCampaignV2(ctx.db, ctx.profile, (await params).id, await body(req)) }))

export const DELETE = (_req: NextRequest, { params }: P) =>
  handle(async ctx => deleteCampaignV2(ctx.db, ctx.profile, (await params).id))
