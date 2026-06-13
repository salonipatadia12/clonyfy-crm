import { NextRequest, NextResponse } from 'next/server'
import { addInfluencerByUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const handle = String(body.handle || '').trim().replace(/^@/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return NextResponse.json({ error: 'invalid handle' }, { status: 400 })
  }
  const result = addInfluencerByUrl({
    handle,
    name: body.name ?? null,
    profile_url: body.profile_url ?? null,
    follower_count: body.follower_count ?? null,
    biography: body.biography ?? null,
    niche: body.niche ?? null,
    addToPipeline: !!body.addToPipeline,
  })
  return NextResponse.json(result)
}
