import { NextRequest } from 'next/server'
import { handle } from '@/lib/route'
import { deleteOffer } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const DELETE = (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  handle(async ctx => deleteOffer(ctx.db, ctx.profile, (await params).id))
