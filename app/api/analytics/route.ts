import { NextRequest } from 'next/server'
import { handle } from '@/lib/route'
import { getAnalyticsV2 } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => {
    const sp = req.nextUrl.searchParams
    return getAnalyticsV2(ctx.db, ctx.profile, {
      clientId: sp.get('clientId') || undefined,
      productId: sp.get('productId') || undefined,
      campaignId: sp.get('campaignId') || undefined,
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
    })
  })
