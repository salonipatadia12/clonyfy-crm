import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listComments, addComment } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const handle = req.nextUrl.searchParams.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })
  return NextResponse.json({ comments: await listComments(ctx.db, ctx.profile, handle) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.handle || !body.body) return NextResponse.json({ error: 'handle and body required' }, { status: 400 })
  try {
    return NextResponse.json({ comment: await addComment(ctx.db, ctx.profile, body.handle, body.body) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
