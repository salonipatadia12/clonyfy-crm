import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listMembers, inviteMember, listReassignmentLog } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const [members, reassignments] = await Promise.all([
    listMembers(ctx.db, ctx.profile),
    listReassignmentLog(ctx.db, ctx.profile),
  ])
  return NextResponse.json({ members, reassignments })
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.email || !body.name) return NextResponse.json({ error: 'name and email required' }, { status: 400 })
  try {
    return NextResponse.json(await inviteMember(ctx.db, ctx.profile, body, req.nextUrl.origin))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return NextResponse.json({ error: msg }, { status: msg === 'admin only' ? 403 : 400 })
  }
}
