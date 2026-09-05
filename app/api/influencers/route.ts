import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listInfluencers, type ListParams } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const num = (k: string) => (sp.get(k) != null && sp.get(k) !== '' ? Number(sp.get(k)) : undefined)
  const params: ListParams = {
    search: sp.get('search') || undefined,
    niche: sp.get('niche') || undefined,
    country: sp.get('country') || undefined,
    minFollowers: num('minFollowers'),
    maxFollowers: num('maxFollowers'),
    verifiedOnly: sp.get('verifiedOnly') === 'true',
    hideInPipeline: sp.get('hideInPipeline') === 'true' || sp.get('notInPipeline') === 'true',
    contactStatus: sp.get('contactStatus') || undefined,
    hasPhone: sp.get('hasPhone') === 'true',
    hasEmail: sp.get('hasEmail') === 'true',
    verificationStatus: sp.get('verificationStatus') || undefined,
    handles: sp.get('handles') ? sp.get('handles')!.split(',').map(h => h.trim()).filter(Boolean) : undefined,
    sort: sp.get('sort') || undefined,
    order: (sp.get('order') as 'asc' | 'desc') || undefined,
    page: num('page'),
    pageSize: num('pageSize'),
  }
  try {
    return NextResponse.json(await listInfluencers(ctx.db, ctx.profile, params))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
