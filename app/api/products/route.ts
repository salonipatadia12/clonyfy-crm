import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { listProducts, createProduct } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) =>
  handle(async ctx => ({ products: await listProducts(ctx.db, ctx.profile, req.nextUrl.searchParams.get('clientId') || undefined) }))
export const POST = (req: NextRequest) =>
  handle(async ctx => ({ product: await createProduct(ctx.db, ctx.profile, await body(req)) }))
