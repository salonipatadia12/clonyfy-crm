import { NextRequest } from 'next/server'
import { handle, body } from '@/lib/route'
import { getCreator, reviewCreator } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type P = { params: Promise<{ id: string }> }

export const GET = (_req: NextRequest, { params }: P) =>
  handle(async ctx => getCreator(ctx.db, ctx.profile, (await params).id))

/** Records a human classification decision (entity type / review state). */
export const PATCH = (req: NextRequest, { params }: P) =>
  handle(async ctx => {
    const b = await body(req)
    return {
      creator: await reviewCreator(ctx.db, ctx.profile, (await params).id, {
        entity_type: b.entity_type ? String(b.entity_type) : undefined,
        review_state: b.review_state ? String(b.review_state) : undefined,
        reason: b.reason ? String(b.reason) : undefined,
      }),
    }
  })
