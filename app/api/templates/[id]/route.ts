import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { updateTemplateV2, deleteTemplateV2 } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type P = { params: Promise<{ id: string }> }

export const PATCH = (req: NextRequest, { params }: P) =>
  handle(async ctx => ({ template: await updateTemplateV2(ctx.db, ctx.profile, (await params).id, await body(req)) }))

export const DELETE = (_req: NextRequest, { params }: P) =>
  handle(async ctx => deleteTemplateV2(ctx.db, ctx.profile, (await params).id))
