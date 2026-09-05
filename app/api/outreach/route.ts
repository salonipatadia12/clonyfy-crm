import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listOutreach, logOutreach } from '@/lib/crm'
import type { OutreachQueue } from '@/types/campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => {
    const sp = req.nextUrl.searchParams
    return listOutreach(ctx.db, ctx.profile, {
      campaignId: sp.get('campaignId') || undefined,
      queue: (sp.get('queue') as OutreachQueue) || undefined,
      ownerId: sp.get('ownerId') || undefined,
      search: sp.get('search') || undefined,
    })
  })

/** Logs a touch the user performed by hand. Nothing is sent from here. */
export const POST = (req: NextRequest) =>
  handle(async ctx => ({ activity: await logOutreach(ctx.db, ctx.profile, await body(req)) }))
