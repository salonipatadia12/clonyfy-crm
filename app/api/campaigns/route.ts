import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listCampaignsV2, createCampaignV2 } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(async ctx => ({ campaigns: await listCampaignsV2(ctx.db, ctx.profile) }))
export const POST = (req: NextRequest) =>
  handle(async ctx => ({ campaign: await createCampaignV2(ctx.db, ctx.profile, await body(req)) }))
