import { NextRequest, NextResponse } from 'next/server'
import { addDeal, listDeals, getInfluencer } from '@/lib/db'

const STATUSES = ['active', 'completed', 'cancelled']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const influencerId = req.nextUrl.searchParams.get('influencer_id') || undefined
  return NextResponse.json({ deals: listDeals(influencerId) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.influencer_id || !body.title?.trim()) {
    return NextResponse.json({ error: 'influencer_id and title required' }, { status: 400 })
  }
  if (!getInfluencer(body.influencer_id)) {
    return NextResponse.json({ error: 'influencer not found' }, { status: 404 })
  }
  if (body.status != null && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }
  if (body.deal_value != null && !Number.isFinite(Number(body.deal_value))) {
    return NextResponse.json({ error: 'invalid deal_value' }, { status: 400 })
  }
  return NextResponse.json({ deal: addDeal(body) })
}
