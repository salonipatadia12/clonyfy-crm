import { NextRequest, NextResponse } from 'next/server'
import { updateDeal } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dealId = Number(id)
  if (!Number.isInteger(dealId) || dealId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const body = await req.json()
  const deal = updateDeal(dealId, body)
  if (!deal) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ deal })
}
