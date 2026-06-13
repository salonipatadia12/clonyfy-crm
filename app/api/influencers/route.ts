import { NextRequest, NextResponse } from 'next/server'
import { listInfluencers, type ListParams } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function arr(v: string | null): string[] | undefined {
  if (!v) return undefined
  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : undefined
}
function num(v: string | null): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const params: ListParams = {
    search: sp.get('search') || undefined,
    niche: arr(sp.get('niche')),
    stage: arr(sp.get('stage')),
    market: arr(sp.get('market')),
    accountType: arr(sp.get('accountType')),
    verifiedOnly: sp.get('verifiedOnly') === 'true',
    inPipeline: sp.get('inPipeline') === 'true' || undefined,
    notInPipeline: sp.get('notInPipeline') === 'true' || undefined,
    minFollowers: num(sp.get('minFollowers')),
    maxFollowers: num(sp.get('maxFollowers')),
    sort: sp.get('sort') || undefined,
    order: (sp.get('order') as 'asc' | 'desc') || undefined,
    page: num(sp.get('page')),
    pageSize: num(sp.get('pageSize')),
  }
  return NextResponse.json(listInfluencers(params))
}
