import { NextRequest, NextResponse } from 'next/server'
import { addSegment, listSegments } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ segments: listSegments() })
}

export async function POST(req: NextRequest) {
  const { name, filters } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  return NextResponse.json({ segment: addSegment(name.trim(), filters ?? {}) })
}
