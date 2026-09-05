import { NextRequest } from 'next/server'
import { handle } from '@/lib/route'
import { deleteOutreach } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const DELETE = (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  handle(async ctx => deleteOutreach(ctx.db, ctx.profile, (await params).id))
