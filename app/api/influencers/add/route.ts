import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, addInfluencer, addToPipeline, enrichAndAdd } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Add Creator (spec §3) — admin only. Inserts into the catalog; does NOT add to
// the pipeline unless explicitly requested.
export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'admin only' }, { status: 403 })

  const body = await req.json()
  const handle = String(body.handle || '').trim().replace(/^@/, '').replace(/\/$/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return NextResponse.json({ error: 'invalid handle' }, { status: 400 })
  }
  try {
    const influencer = body.enrich
      ? await enrichAndAdd(ctx.db, ctx.profile, handle)
      : await addInfluencer(ctx.db, ctx.profile, {
          handle,
          full_name: body.name ?? null,
          profile_url: body.profile_url ?? null,
          follower_count: body.follower_count ?? null,
          biography: body.biography ?? null,
          niche: body.niche ?? null,
          country: body.country ?? null,
          bio_link: body.bio_link ?? null,
        })
    if (body.addToPipeline) await addToPipeline(ctx.db, ctx.profile, [handle])
    return NextResponse.json({ influencer, created: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
