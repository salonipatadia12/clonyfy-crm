import { NextRequest } from 'next/server'
import { handle, num } from '@/lib/route'
import { listCreators, type CreatorListParams, type CreatorView } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => {
    const sp = req.nextUrl.searchParams
    const params: CreatorListParams = {
      view: (sp.get('view') as CreatorView) || undefined,
      search: sp.get('search') || undefined,
      niche: sp.get('niche') || undefined,
      minFollowers: num(sp.get('minFollowers')),
      maxFollowers: num(sp.get('maxFollowers')),
      geoStatus: sp.get('geoStatus') || undefined,
      platform: sp.get('platform') || undefined,
      contact: sp.get('contact') || undefined,
      verification: sp.get('verification') || undefined,
      entityType: sp.get('entityType') || undefined,
      qualification: sp.get('qualification') || undefined,
      campaignId: sp.get('campaignId') || undefined,
      notInCampaignId: sp.get('notInCampaignId') || undefined,
      notForClientId: sp.get('notForClientId') || undefined,
      sort: sp.get('sort') || undefined,
      order: (sp.get('order') as 'asc' | 'desc') || undefined,
      page: num(sp.get('page')),
      pageSize: num(sp.get('pageSize')),
    }
    return listCreators(ctx.db, ctx.profile, params)
  })
