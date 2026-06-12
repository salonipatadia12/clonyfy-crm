import { NextRequest, NextResponse } from 'next/server'
import { addNote, listNotes, getInfluencer } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ notes: listNotes(id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getInfluencer(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })
  return NextResponse.json({ note: addNote(id, content.trim()) })
}
