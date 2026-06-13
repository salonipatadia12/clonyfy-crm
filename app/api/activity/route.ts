import { NextRequest, NextResponse } from 'next/server'
import { logActivity, getInfluencer } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['dm'])

// Log a client-initiated action (e.g. "sent a DM") to the activity feed.
export async function POST(req: NextRequest) {
  const { kind, influencer_id, detail } = await req.json()
  if (!ALLOWED.has(kind)) return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
  if (influencer_id && !getInfluencer(influencer_id)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  logActivity(kind, influencer_id ?? null, detail ?? null)
  return NextResponse.json({ ok: true })
}
