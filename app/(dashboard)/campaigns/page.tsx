'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Megaphone, Plus, Search, Users } from 'lucide-react'
import { useCampaignList, useClients } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONE, OBJECTIVES } from '@/lib/domain'
import { formatNum } from '@/lib/utils'
import type { Campaign } from '@/types/campaign'
import { DemoBadge } from '@/components/crm/demo'

export default function CampaignsPage() {
  const { data, isLoading, error, refetch } = useCampaignList()
  const { data: clients } = useClients()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Shimmer className="h-8 w-44" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Shimmer key={i} className="h-52 rounded-xl" />)}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Campaigns" />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    )
  }

  const all = data ?? []
  const rows = all.filter(c =>
    (!status || c.status === status) &&
    (!clientId || c.client_id === clientId) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.product_name ?? '').toLowerCase().includes(search.toLowerCase())
      || (c.client_name ?? '').toLowerCase().includes(search.toLowerCase())))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        description="Each campaign promotes one product for one client. A creator can be in as many campaigns as you like — their stage belongs to the campaign, not to them."
        actions={
          <Button asChild size="sm">
            <Link href="/campaigns/new"><Plus className="h-3.5 w-3.5" aria-hidden /> New campaign</Link>
          </Button>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="A campaign is where a client product, a creator brief, an offer and a set of deliverables come together. Create one and Clonify can start matching your catalog against it."
          actions={
            <>
              <Button asChild size="sm"><Link href="/campaigns/new">Create your first campaign</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/clients">Add a client first</Link></Button>
            </>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" className="pl-8" />
            </div>
            <Select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} containerClassName="sm:w-40">
              <option value="">Any status</option>
              {Object.entries(CAMPAIGN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select aria-label="Client" value={clientId} onChange={e => setClientId(e.target.value)} containerClassName="sm:w-48">
              <option value="">Any client</option>
              {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              compact
              title="No campaigns match these filters"
              description="Try clearing the status or client filter."
              actions={<Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatus(''); setClientId('') }}>Clear filters</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map(c => <CampaignCard key={c.id} campaign={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CampaignCard({ campaign: c }: { campaign: Campaign }) {
  const s = c.stats
  const target = c.brief_creator_target
  const pct = target ? Math.min(100, Math.round((s.creators / target) * 100)) : null
  const objective = OBJECTIVES.find(o => o.value === c.objective)

  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="surface flex min-w-0 flex-col gap-3 overflow-hidden p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{c.name}</p>
          <DemoBadge on={c.demo_run_id} className="mt-1" />
          <p className="truncate text-2xs text-muted-foreground">
            {[c.client_name, c.product_name].filter(Boolean).join(' · ') || 'No client/product linked'}
          </p>
        </div>
        <Badge tone={CAMPAIGN_STATUS_TONE[c.status] ?? 'neutral'}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {objective && <Badge tone="outline">{objective.label}</Badge>}
        {c.brief_geo === 'us_only' && <Badge tone="outline">US only</Badge>}
        {(c.brief_niches ?? []).slice(0, 2).map(n => <Badge key={n} tone="outline">{n.replace(/_/g, ' ')}</Badge>)}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ['Creators', s.creators], ['Contacted', s.contacted],
          ['Agreed', s.agreed], ['Live', s.live],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md bg-muted/60 py-1.5">
            <dd className="text-sm font-semibold tnum">{formatNum(value as number)}</dd>
            <dt className="text-2xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {pct !== null && (
        <div className="space-y-1">
          <p className="flex justify-between text-2xs text-muted-foreground">
            <span>Creator target</span>
            <span className="tnum">{s.creators} of {target}</span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Creator target progress">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {s.followUpsOverdue > 0 && <Badge tone="danger">{s.followUpsOverdue} follow-up{s.followUpsOverdue === 1 ? '' : 's'} overdue</Badge>}
        {s.deliverablesOverdue > 0 && <Badge tone="warning">{s.deliverablesOverdue} deliverable{s.deliverablesOverdue === 1 ? '' : 's'} overdue</Badge>}
        {s.awaitingApproval > 0 && <Badge tone="info">{s.awaitingApproval} awaiting approval</Badge>}
        {s.creators === 0 && (
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden /> No creators added yet
          </span>
        )}
      </div>
    </Link>
  )
}
