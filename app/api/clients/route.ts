import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listClients, createClient } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(async ctx => ({ clients: await listClients(ctx.db, ctx.profile) }))
export const POST = (req: NextRequest) =>
  handle(async ctx => ({ client: await createClient(ctx.db, ctx.profile, await body(req)) }))
