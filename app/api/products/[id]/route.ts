import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { updateProduct, deleteProduct } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type P = { params: Promise<{ id: string }> }

export const PATCH = (req: NextRequest, { params }: P) =>
  handle(async ctx => ({ product: await updateProduct(ctx.db, ctx.profile, (await params).id, await body(req)) }))
export const DELETE = (_req: NextRequest, { params }: P) =>
  handle(async ctx => deleteProduct(ctx.db, ctx.profile, (await params).id))
