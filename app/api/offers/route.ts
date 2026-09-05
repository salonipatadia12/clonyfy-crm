import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listOffers, upsertOffer } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => ({
    offers: await listOffers(ctx.db, ctx.profile, {
      campaignId: req.nextUrl.searchParams.get('campaignId') || undefined,
      status: req.nextUrl.searchParams.get('status') || undefined,
    }),
  }))

export const POST = (req: NextRequest) =>
  handle(async ctx => ({ offer: await upsertOffer(ctx.db, ctx.profile, await body(req)) }))
