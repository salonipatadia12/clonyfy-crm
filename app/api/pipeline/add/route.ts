import { NextRequest, NextResponse } from 'next/server'
import { addToPipeline } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
  const added = addToPipeline(ids)
  return NextResponse.json({ added })
}
