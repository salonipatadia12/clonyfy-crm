import { NextResponse } from 'next/server'
import { requireCtx } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = {
  contact_status: string | null
  verification_status: string | null
  discovery_route: string | null
  source: string | null
  niche: string | null
  country: string | null
  platform: string | null
  follower_count: number | null
  email: string | null
  phone: string | null
  email_type: string | null
  phone_type: string | null
}

const tally = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m: Record<string, number> = {}
  for (const r of rows) {
    const k = key(r) || 'unknown'
    m[k] = (m[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]))
}

export async function GET() {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Page through the catalog: PostgREST caps a single response, and the
  // sourcing view is a whole-catalog rollup rather than a filtered slice.
  const rows: Row[] = []
  const PAGE = 1000
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await ctx.db.from('influencers')
      .select('contact_status, verification_status, discovery_route, source, niche, country, platform, follower_count, email, phone, email_type, phone_type')
      .eq('workspace_id', ctx.profile.workspace_id)
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(data ?? []) as Row[])
    if (!data || data.length < PAGE) break
  }

  const contactable = rows.filter(r => r.email || r.phone)
  const complete = rows.filter(r => r.contact_status === 'complete')

  // A campaign is identified by the prefix the importer writes into `source`.
  const campaigns: Record<string, { total: number; complete: number; email_only: number; phone_only: number; pending: number }> = {}
  for (const r of rows) {
    const camp = (r.source ?? '').split(':')[0]
    if (!camp || !/_\d{8}_\d{6}$/.test(camp)) continue
    const c = campaigns[camp] ??= { total: 0, complete: 0, email_only: 0, phone_only: 0, pending: 0 }
    c.total++
    if (r.contact_status === 'complete') c.complete++
    else if (r.contact_status === 'email_only') c.email_only++
    else if (r.contact_status === 'phone_only') c.phone_only++
    if (r.verification_status === 'pending_instagram_verification') c.pending++
  }

  return NextResponse.json({
    totals: {
      catalog: rows.length,
      contactable: contactable.length,
      complete: complete.length,
      email_only: rows.filter(r => r.contact_status === 'email_only').length,
      phone_only: rows.filter(r => r.contact_status === 'phone_only').length,
      no_contact: rows.filter(r => r.contact_status === 'none').length,
      with_email: rows.filter(r => r.email).length,
      with_phone: rows.filter(r => r.phone).length,
      pending_verification: rows.filter(r => r.verification_status === 'pending_instagram_verification').length,
    },
    byPlatform: tally(rows, r => r.platform),
    byRoute: tally(rows.filter(r => r.discovery_route), r => r.discovery_route),
    bySource: tally(rows.filter(r => r.source), r => r.source),
    campaigns,
    contactableByNiche: tally(contactable, r => r.niche),
    contactableByCountry: tally(contactable, r => r.country),
    emailTypes: tally(rows.filter(r => r.email_type), r => r.email_type),
    phoneTypes: tally(rows.filter(r => r.phone_type), r => r.phone_type),
  })
}
