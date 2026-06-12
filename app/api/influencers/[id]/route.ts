import { NextRequest, NextResponse } from 'next/server'
import { getInfluencer, updateInfluencer, moveStage, listNotes, listPipelineEntries, listDeals } from '@/lib/db'
import { STAGES } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const influencer = getInfluencer(id)
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({
    influencer,
    notes: listNotes(id),
    pipeline: listPipelineEntries(id),
    deals: listDeals(id),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!getInfluencer(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Stage moves are recorded as pipeline history.
  if (body.stage !== undefined) {
    if (typeof body.stage !== 'string' || !STAGES.includes(body.stage)) {
      return NextResponse.json({ error: 'invalid stage' }, { status: 400 })
    }
    moveStage(id, body.stage, typeof body.note === 'string' ? body.note : undefined)
    delete body.stage
    delete body.note
  }
  const influencer = updateInfluencer(id, body)
  return NextResponse.json({ influencer })
}
