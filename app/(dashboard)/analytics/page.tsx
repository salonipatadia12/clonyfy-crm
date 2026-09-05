'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { BarChart3, Info } from 'lucide-react'
import { useAnalyticsV2, useClients, useProducts, useCampaignList } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { Table, TableScroll, THead, TH, TR, TD } from '@/components/ui/table'
import { formatNum } from '@/lib/utils'
import { CHART_HEX } from '@/lib/utils'
import type { AnalyticsPayload } from '@/types/campaign'

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Shimmer className="h-96 rounded-xl" />}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const params = useSearchParams()
  const g = (k: string) => params?.get(k) ?? ''
  const setParam = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    router.replace(`/analytics?${p.toString()}`, { scroll: false })
  }

  const filters = {
    clientId: g('clientId') || undefined,
    productId: g('productId') || undefined,
    campaignId: g('campaignId') || undefined,
    from: g('from') || undefined,
    to: g('to') || undefined,
  }
  const { data, isLoading, error, refetch } = useAnalyticsV2(filters)
  const { data: clients } = useClients()
  const { data: products } = useProducts(filters.clientId)
  const { data: campaigns } = useCampaignList()

  const scopedCampaigns = (campaigns ?? []).filter(c =>
    (!filters.clientId || c.client_id === filters.clientId) &&
    (!filters.productId || c.product_id === filters.productId))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Did the campaign work? Only metrics backed by rows in this workspace appear here — nothing is modelled, estimated or extrapolated."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Client" value={filters.clientId ?? ''} onChange={e => setParam({ clientId: e.target.value || null, productId: null, campaignId: null })} containerClassName="sm:w-48">
          <option value="">All clients</option>
          {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Product" value={filters.productId ?? ''} onChange={e => setParam({ productId: e.target.value || null, campaignId: null })} containerClassName="sm:w-48">
          <option value="">All products</option>
          {(products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Campaign" value={filters.campaignId ?? ''} onChange={e => setParam({ campaignId: e.target.value || null })} containerClassName="sm:w-56">
          <option value="">All campaigns</option>
          {scopedCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {(filters.clientId || filters.productId || filters.campaignId) && (
          <Button variant="ghost" size="sm" onClick={() => router.replace('/analytics', { scroll: false })}>Clear filters</Button>
        )}
      </div>

      {error ? <ErrorState error={error} onRetry={() => refetch()} />
        : isLoading || !data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Shimmer key={i} className="h-24 rounded-xl" />)}
          </div>
        )
        : data.scope.campaigns === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No campaigns in this scope"
            description="Analytics measures campaign work. Create a campaign for a client product, shortlist creators and log outreach — the numbers here follow from those rows."
            actions={<Button asChild size="sm"><Link href="/campaigns/new">Create a campaign</Link></Button>}
          />
        ) : <Report data={data} />}
    </div>
  )
}

function Report({ data }: { data: AnalyticsPayload }) {
  const noWork = data.funnel.every(f => f.count === 0)
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <Badge tone="info">{data.scope.label}</Badge>
        <span>{data.scope.campaigns} campaign{data.scope.campaigns === 1 ? '' : 's'} in scope</span>
      </p>

      {noWork ? (
        <EmptyState
          compact
          title="No creator work recorded in this scope yet"
          description="Shortlist creators for a campaign, then log outreach and deliverables. Every figure on this page is counted from those rows."
        />
      ) : (
        <>
          <section className="surface p-4">
            <h2 className="section-title mb-3">Stage funnel</h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.funnel} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={36} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.funnel.map((_, i) => <Cell key={i} fill={CHART_HEX[0]} fillOpacity={1 - i * 0.07} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-2xs text-muted-foreground">
              Each bar counts creators who reached that stage or beyond, so the funnel only ever decreases.
            </p>
          </section>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section className="surface p-4">
              <h2 className="section-title mb-3">Stage conversion</h2>
              <ul className="space-y-1.5">
                {data.conversion.map(c => (
                  <li key={c.label} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-muted-foreground">{c.label}</span>
                    <span className="shrink-0 tnum font-medium">
                      {c.rate == null ? <span className="font-normal text-muted-foreground">No data</span> : `${c.rate}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="surface p-4">
              <h2 className="section-title mb-3">Outreach</h2>
              <dl className="grid grid-cols-2 gap-3">
                <Metric label="Messages logged" value={data.outreach.messagesLogged} />
                <Metric label="Creators contacted" value={data.outreach.creatorsContacted} />
                <Metric label="Replies" value={data.outreach.replies} />
                <Metric label="Positive replies" value={data.outreach.positiveReplies} />
                <Metric label="Reply rate" value={data.outreach.replyRate} suffix="%" />
                <Metric label="Median response time" value={data.outreach.medianResponseHours} suffix="h" />
              </dl>
            </section>

            <section className="surface p-4">
              <h2 className="section-title mb-3">Agreements</h2>
              <dl className="grid grid-cols-2 gap-3">
                <Metric label="Creators agreed" value={data.agreements.agreed} />
                <Metric label="Offers accepted" value={data.agreements.offersAccepted} />
                <Metric
                  label="Committed compensation"
                  value={data.agreements.committedSpend}
                  suffix={` ${data.agreements.currency}`}
                  emptyLabel="No fees recorded"
                />
              </dl>
            </section>

            <section className="surface p-4">
              <h2 className="section-title mb-3">Deliverables</h2>
              <dl className="grid grid-cols-3 gap-3">
                <Metric label="Planned" value={data.deliverables.planned} />
                <Metric label="Submitted" value={data.deliverables.submitted} />
                <Metric label="Approved" value={data.deliverables.approved} />
                <Metric label="Published" value={data.deliverables.published} />
                <Metric label="Overdue" value={data.deliverables.overdue} />
              </dl>
            </section>
          </div>

          <section className="surface p-4">
            <h2 className="section-title mb-3">Published content</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Views" value={data.content.views} emptyLabel="Not recorded" />
              <Metric label="Likes" value={data.content.likes} emptyLabel="Not recorded" />
              <Metric label="Comments" value={data.content.comments} emptyLabel="Not recorded" />
              <Metric label="Clicks" value={data.performance.clicks} emptyLabel="Not recorded" />
            </dl>
            <p className="mt-2 flex items-start gap-1.5 text-2xs text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              Numbers cover the {data.content.recorded} of {data.content.total} published deliverable{data.content.total === 1 ? '' : 's'} with figures entered.
              Revenue, conversions and ROAS are only shown when someone records them — Clonify never estimates them.
            </p>
          </section>

          <section className="surface overflow-hidden">
            <h2 className="section-title border-b border-border p-4 pb-3">By campaign</h2>
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    <TH>Campaign</TH><TH>Client / product</TH>
                    <TH align="right">Creators</TH><TH align="right">Contacted</TH>
                    <TH align="right">Replied</TH><TH align="right">Agreed</TH>
                    <TH align="right">Live</TH><TH align="right">Published</TH><TH align="right">Views</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.byCampaign.map(c => (
                    <TR key={c.id}>
                      <TD><Link href={`/campaigns/${c.id}`} className="text-[13px] text-primary hover:underline">{c.name}</Link></TD>
                      <TD className="text-2xs text-muted-foreground">{[c.client_name, c.product_name].filter(Boolean).join(' · ') || '—'}</TD>
                      <TD align="right" className="tnum">{c.creators}</TD>
                      <TD align="right" className="tnum">{c.contacted}</TD>
                      <TD align="right" className="tnum">{c.replied}</TD>
                      <TD align="right" className="tnum">{c.agreed}</TD>
                      <TD align="right" className="tnum">{c.live}</TD>
                      <TD align="right" className="tnum">{c.published}</TD>
                      <TD align="right" className="tnum">{c.views == null ? <span className="text-muted-foreground">—</span> : formatNum(c.views)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </section>

          {data.byOwner.length > 1 && (
            <section className="surface overflow-hidden">
              <h2 className="section-title border-b border-border p-4 pb-3">By owner</h2>
              <TableScroll>
                <Table>
                  <THead>
                    <tr><TH>Owner</TH><TH align="right">Creators</TH><TH align="right">Contacted</TH><TH align="right">Replied</TH><TH align="right">Agreed</TH></tr>
                  </THead>
                  <tbody>
                    {data.byOwner.map(o => (
                      <TR key={o.id ?? 'none'}>
                        <TD className="text-[13px]">{o.name}</TD>
                        <TD align="right" className="tnum">{o.creators}</TD>
                        <TD align="right" className="tnum">{o.contacted}</TD>
                        <TD align="right" className="tnum">{o.replied}</TD>
                        <TD align="right" className="tnum">{o.agreed}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** A number, or an explicit statement that it was never recorded. Never a fake 0. */
function Metric({ label, value, suffix, emptyLabel = 'No data' }: {
  label: string; value: number | null; suffix?: string; emptyLabel?: string
}) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tnum">
        {value == null
          ? <span className="text-[13px] font-normal text-muted-foreground">{emptyLabel}</span>
          : <>{formatNum(value)}{suffix}</>}
      </dd>
    </div>
  )
}
