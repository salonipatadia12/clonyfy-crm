import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listDeliverables, createDeliverable, applyDeliverablePlan, type DeliverableListParams } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => {
    const sp = req.nextUrl.searchParams
    return {
      deliverables: await listDeliverables(ctx.db, ctx.profile, {
        campaignId: sp.get('campaignId') || undefined,
        ccId: sp.get('ccId') || undefined,
        ownerId: sp.get('ownerId') || undefined,
        view: (sp.get('view') as DeliverableListParams['view']) || undefined,
      }),
    }
  })

export const POST = (req: NextRequest) =>
  handle(async ctx => {
    const b = await body(req)
    // `applyPlan` creates the campaign's whole planned set for one creator.
    if (b.applyPlan) return applyDeliverablePlan(ctx.db, ctx.profile, String(b.campaign_creator_id))
    return { deliverable: await createDeliverable(ctx.db, ctx.profile, b) }
  })
