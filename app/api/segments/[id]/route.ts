import { NextRequest, NextResponse } from 'next/server'
import { deleteSegment } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteSegment(Number(id))
  return NextResponse.json({ ok: true })
}
