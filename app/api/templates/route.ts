import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listTemplatesV2, createTemplateV2 } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(async ctx => ({ templates: await listTemplatesV2(ctx.db, ctx.profile) }))
export const POST = (req: NextRequest) =>
  handle(async ctx => ({ template: await createTemplateV2(ctx.db, ctx.profile, await body(req)) }))
