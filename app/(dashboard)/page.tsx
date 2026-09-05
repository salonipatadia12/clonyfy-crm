'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Users, Mail, Phone, MapPin, CircleDashed, CalendarClock, Megaphone } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { DemoBadge } from '@/components/crm/demo'
import { ccStageLabel, CC_STAGE_TONE, today } from '@/lib/domain'
import { formatNum } from '@/lib/utils'
import type { DashboardResponse, DashboardLine } from '@/types/campaign'

/**
 * Seven numbers and three lists.
 *
 * Every tile links to the exact list it counts, so a number is a starting point
 * for work rather than a fact to admire.
 */
const TILES = [
  { key: 'total', label: 'Total influencers', icon: Users, href: '/influencers' },
  { key: 'withEmail', label: 'Has email', icon: Mail, href: '/influencers?contact=email' },
  { key: 'withPhone', label: 'Has phone', icon: Phone, href: '/influencers?contact=phone' },
  { key: 'usBased', label: 'In the US', icon: MapPin, href: '/influencers?us=1' },
  { key: 'notContacted', label: 'Not contacted', icon: CircleDashed, href: '/influencers?status=not_contacted' },
  { key: 'followUpsDue', label: 'Follow up today', icon: CalendarClock, href: '/campaigns' },
  { key: 'activeCampaigns', label: 'Active campaigns', icon: Megaphone, href: '/campaigns' },
] as const

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const r = await fetch('/api/dashboard')
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Could not load the dashboard.')
      return r.json() as Promise<DashboardResponse>
    },
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Who you have, who still needs contacting, and what is running."
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href="/influencers">Find influencers</Link></Button>
            <Button asChild size="sm"><Link href="/campaigns/new">New campaign</Link></Button>
          </>
        }
      />

      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {TILES.map(t => (
              <Link
                key={t.key}
                href={t.href}
                className="surface flex flex-col gap-1.5 p-3.5 transition-colors hover:border-primary/40"
              >
                <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                  <t.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t.label}</span>
                </span>
                {isLoading
                  ? <Shimmer className="h-7 w-14 rounded" />
                  : <span className="tnum text-2xl font-semibold leading-none">{formatNum(data?.stats[t.key] ?? 0)}</span>}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <ListCard
              title="Follow up today"
              empty="Nothing is due. Follow-up dates you set on a campaign show up here."
              loading={isLoading}
              rows={data?.followUpsToday ?? []}
              renderMeta={r => <DueChip date={r.date} />}
            />
            <ListCard
              title="Recent replies"
              empty="No replies logged yet."
              loading={isLoading}
              rows={data?.recentReplies ?? []}
              renderMeta={r => <Badge tone={CC_STAGE_TONE[r.stage as never] ?? 'neutral'}>{ccStageLabel(r.stage)}</Badge>}
            />

            <section className="surface p-4">
              <h2 className="section-title mb-3">Active campaigns</h2>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Shimmer key={i} className="h-14 rounded-lg" />)}</div>
              ) : !data?.activeCampaigns.length ? (
                <EmptyState
                  title="No active campaigns"
                  description="Create one to start assigning influencers."
                  actions={<Button asChild size="sm"><Link href="/campaigns/new">New campaign</Link></Button>}
                />
              ) : (
                <ul className="space-y-1.5">
                  {data.activeCampaigns.map(c => (
                    <li key={c.id}>
                      <Link href={`/campaigns/${c.id}`} className="block rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{c.name}</span>
                          <DemoBadge on={c.demo_run_id} />
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {[c.client_name, c.product_name].filter(Boolean).join(' · ') || 'No client or product set'}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
                          <span><span className="tnum font-medium text-foreground">{c.creators}</span> added</span>
                          <span><span className="tnum font-medium text-foreground">{c.contacted}</span> contacted</span>
                          <span><span className="tnum font-medium text-foreground">{c.replied}</span> replied</span>
                          <span><span className="tnum font-medium text-foreground">{c.interested}</span> interested</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function ListCard({ title, rows, empty, loading, renderMeta }: {
  title: string
  rows: DashboardLine[]
  empty: string
  loading: boolean
  renderMeta: (r: DashboardLine) => React.ReactNode
}) {
  return (
    <section className="surface p-4">
      <h2 className="section-title mb-3">{title}</h2>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Shimmer key={i} className="h-12 rounded-lg" />)}</div>
      ) : !rows.length ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(r => (
            <li key={r.campaign_creator_id}>
              <Link href={`/campaigns/${r.campaign_id}`} className="flex items-center gap-2 py-2.5 hover:text-primary">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.full_name || '@' + r.handle}</span>
                  <span className="block truncate text-2xs text-muted-foreground">{r.campaign_name}</span>
                </span>
                <span className="shrink-0">{renderMeta(r)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DueChip({ date }: { date: string | null }) {
  if (!date) return null
  const t = today()
  if (date < t) {
    const days = Math.round((Date.parse(t) - Date.parse(date)) / 864e5)
    return <Badge tone="danger">{days} day{days === 1 ? '' : 's'} late</Badge>
  }
  return <Badge tone="warning">Today</Badge>
}
