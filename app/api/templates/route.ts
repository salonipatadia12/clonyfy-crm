import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, listTemplates, createTemplate } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ templates: await listTemplates(ctx.db, ctx.profile) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.name || !body.body) return NextResponse.json({ error: 'name and body required' }, { status: 400 })
  try {
    return NextResponse.json({ template: await createTemplate(ctx.db, ctx.profile, body) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
