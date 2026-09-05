import { NextRequest } from 'next/server'
import { handle } from '@/lib/route'
import { rescoreCampaign } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  handle(async ctx => rescoreCampaign(ctx.db, ctx.profile, (await params).id))
