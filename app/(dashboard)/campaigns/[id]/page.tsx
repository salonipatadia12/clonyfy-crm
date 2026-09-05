'use client'

import { Suspense, use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Search, Users, Send, Handshake, PackageCheck, BarChart3, Settings2, Trash2,
} from 'lucide-react'
import {
  useCampaignDetail, useUpdateCampaignV2, useDeleteCampaignV2, useDeliverables,
} from '@/lib/queries'
import { useMembers } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { CampaignBoard } from '@/components/crm/campaign-board'
import { CreatorDrawer } from '@/components/crm/creator-drawer'
import { OutreachPanel } from '@/components/crm/outreach-panel'
import { OfferPanel } from '@/components/crm/offer-panel'
import { DeliverableTable } from '@/components/crm/deliverable-table'
import {
  CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONE, CAMPAIGN_STATUSES, ccStageLabel,
} from '@/lib/domain'
import { Labelled } from '@/components/ui/field'
import { formatNum, nicheLabel } from '@/lib/utils'
import type { Campaign, CampaignCreator } from '@/types/campaign'
import { DemoBadge } from '@/components/crm/demo'

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<Shimmer className="h-96 rounded-xl" />}>
      <Detail id={id} />
    </Suspense>
  )
}

function Detail({ id }: { id: string }) {
  const router = useRouter()
  const search = useSearchParams()
  const isAdmin = useIsAdmin()
  const { data, isLoading, error, refetch } = useCampaignDetail(id)
  const { data: memberData } = useMembers()
  const update = useUpdateCampaignV2()
  const del = useDeleteCampaignV2()
  const [openCreator, setOpenCreator] = useState<CampaignCreator | null>(null)

  if (isLoading) return <Shimmer className="h-96 rounded-xl" />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!data) return null

  const { campaign: c, creators } = data
  const members = (memberData?.members ?? []).map(m => ({ id: m.id, name: m.name }))
  const s = c.stats

  // "Find creators" opens the catalog pre-filtered by this campaign's brief,
  // and excludes creators already in it.
  const findHref = (() => {
    const p = new URLSearchParams()
    p.set('view', 'qualified')
    if (c.brief_niches?.length) p.set('niche', c.brief_niches.join(','))
    if (c.brief_geo === 'us_only' || c.brief_geo === 'us_preferred') p.set('geo', 'confirmed_us')
    if (c.brief_platforms?.length === 1) p.set('platform', c.brief_platforms[0])
    if (c.brief_contact_pref && c.brief_contact_pref !== 'any') p.set('contact', c.brief_contact_pref)
    p.set('notInCampaignId', c.id)
    return `/creators?${p.toString()}`
  })()

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        titleBadge={<DemoBadge on={c.demo_run_id} />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={CAMPAIGN_STATUS_TONE[c.status] ?? 'neutral'}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
            {c.client_name && <span>{c.client_name}</span>}
            {c.product_name && <span>· {c.product_name}</span>}
            {c.owner_name && <span>· Owner {c.owner_name}</span>}
            {(c.start_date || c.end_date) && <span>· {c.start_date ?? '?'} → {c.end_date ?? '?'}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link href="/campaigns"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />All campaigns</Link></Button>
            <Button asChild size="sm"><Link href={findHref}><Search className="h-3.5 w-3.5" aria-hidden />Find influencers</Link></Button>
          </>
        }
      />

      {/* The six numbers the campaign page is for. Each influencer sits in
          exactly one status, so the last five add up to the first. */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Added', s.creators], ['Not contacted', s.notContacted], ['Contacted', s.contacted],
          ['Replied', s.replied], ['Interested', s.interested], ['Declined', s.declined],
        ].map(([label, value]) => (
          <div key={label as string} className="surface p-3">
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tnum">{formatNum(value as number)}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue={search?.get('tab') ?? 'overview'}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview"><Settings2 className="mr-1 h-3.5 w-3.5" aria-hidden />Overview</TabsTrigger>
          <TabsTrigger value="creators"><Users className="mr-1 h-3.5 w-3.5" aria-hidden />Influencers ({s.creators})</TabsTrigger>
          <TabsTrigger value="outreach"><Send className="mr-1 h-3.5 w-3.5" aria-hidden />Outreach</TabsTrigger>
          <TabsTrigger value="offers"><Handshake className="mr-1 h-3.5 w-3.5" aria-hidden />Offers</TabsTrigger>
          <TabsTrigger value="deliverables"><PackageCheck className="mr-1 h-3.5 w-3.5" aria-hidden />Deliverables ({s.deliverablesTotal})</TabsTrigger>
          <TabsTrigger value="performance"><BarChart3 className="mr-1 h-3.5 w-3.5" aria-hidden />Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Overview
            campaign={c}
            isAdmin={isAdmin}
            onStatus={v => update.mutate({ id: c.id, patch: { status: v } }, { onError: e => toast.error(e.message) })}
            onDelete={() => {
              if (!confirm(`Delete "${c.name}"? Its influencer list is deleted with it. The influencers themselves stay in your list.`)) return
              del.mutate(c.id, { onSuccess: () => { toast.success('Campaign deleted.'); router.push('/campaigns') }, onError: e => toast.error(e.message) })
            }}
          />
        </TabsContent>

        <TabsContent value="creators">
          {creators.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No influencers in this campaign yet"
              description="Add influencers from your list. Each one gets their own status here — adding someone to this campaign does not change their status in any other."
              actions={<Button asChild size="sm"><Link href={findHref}>Add influencers</Link></Button>}
            />
          ) : (
            <CampaignBoard creators={creators} members={members} />
          )}
        </TabsContent>

        <TabsContent value="outreach">
          <OutreachPanel campaign={c} creators={creators} />
        </TabsContent>

        <TabsContent value="offers">
          <OfferPanel campaign={c} creators={creators} />
        </TabsContent>

        <TabsContent value="deliverables">
          <CampaignDeliverables campaignId={c.id} creators={creators} />
        </TabsContent>

        <TabsContent value="performance">
          <Performance campaign={c} creators={creators} />
        </TabsContent>
      </Tabs>

      <CreatorDrawer
        creatorId={openCreator?.influencer_id ?? null}
        campaignId={c.id}
        onOpenChange={(o: boolean) => { if (!o) setOpenCreator(null) }}
      />
    </div>
  )
}

/* --------------------------------------------------------------- overview */

/**
 * What the campaign is, in one card.
 *
 * The brief, offer terms, usage rights, whitelisting, tracking links, hashtags
 * and disclosure text all lived here as read-only rows nobody edited. What a
 * person needs on this screen is who it is for, when it runs, and what the
 * notes say.
 */
function Overview({ campaign: c, isAdmin, onStatus, onDelete }: {
  campaign: Campaign
  isAdmin: boolean
  onStatus: (v: string) => void
  onDelete: () => void
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-border py-2 last:border-0">
      <dt className="w-40 shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px]">{value}</dd>
    </div>
  )
  const notSet = <span className="text-muted-foreground">Not set</span>

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <section className="surface p-4">
        <h2 className="section-title mb-2">Campaign</h2>
        <dl>
          {row('Client', c.client_name ?? notSet)}
          {row('Product', c.product_name ?? notSet)}
          {row('Niche', c.brief_niches?.length
            ? <span className="flex flex-wrap gap-1">{c.brief_niches.map(n => <Badge key={n} tone="outline">{nicheLabel(n)}</Badge>)}</span>
            : notSet)}
          {row('Runs', c.start_date || c.end_date
            ? `${c.start_date ?? '—'} → ${c.end_date ?? '—'}`
            : notSet)}
          {row('Owner', c.owner_name ?? notSet)}
          {row('Notes', c.brief_notes || c.brief
            ? <span className="whitespace-pre-wrap">{c.brief_notes || c.brief}</span>
            : notSet)}
        </dl>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="section-title">Settings</h2>
        <Labelled label="Status">
          <Select value={c.status} onChange={e => onStatus(e.target.value)} disabled={!isAdmin}>
            {CAMPAIGN_STATUSES.map(v => <option key={v} value={v}>{CAMPAIGN_STATUS_LABELS[v]}</option>)}
          </Select>
        </Labelled>
        {isAdmin && (
          <div className="border-t border-border pt-3">
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete campaign
            </Button>
            <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
              Deletes this campaign and its influencer list. The influencers themselves stay in your list.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function CampaignDeliverables({ campaignId, creators }: { campaignId: string; creators: CampaignCreator[] }) {
  const { data, isLoading, error, refetch } = useDeliverables({ campaignId })
  if (isLoading) return <Shimmer className="h-64 rounded-xl" />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  return <DeliverableTable rows={data ?? []} creators={creators} showCampaign={false} />
}

/* ---------------------------------------------------------- performance */

function Performance({ campaign: c, creators }: { campaign: Campaign; creators: CampaignCreator[] }) {
  const { data: deliverables } = useDeliverables({ campaignId: c.id })
  const published = (deliverables ?? []).filter(d => d.approval_state === 'published')
  const withViews = published.filter(d => d.views != null)
  const totals = useMemo(() => {
    const sum = (k: 'views' | 'likes' | 'comments_count') => {
      const vals = published.map(d => d[k]).filter(v => v != null) as number[]
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null
    }
    return { views: sum('views'), likes: sum('likes'), comments: sum('comments_count') }
  }, [deliverables]) // eslint-disable-line react-hooks/exhaustive-deps

  const stages = creators.reduce<Record<string, number>>((acc, c2) => {
    acc[c2.stage] = (acc[c2.stage] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <section className="surface p-4">
        <h2 className="section-title mb-3">Where the creators are</h2>
        {creators.length === 0
          ? <p className="text-[13px] text-muted-foreground">No creators in this campaign yet.</p>
          : (
            <ul className="space-y-1.5">
              {Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, n]) => (
                <li key={stage} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{ccStageLabel(stage)}</span>
                  {/* Fill inside a fixed track — a percentage width on the bar
                      itself is measured against the flex line, not the space
                      left over, and overflows in a narrow column. */}
                  <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-28">
                    <span className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.max((n / creators.length) * 100, 3)}%` }} />
                  </span>
                  <span className="shrink-0 text-2xs tnum text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="surface p-4">
        <h2 className="section-title mb-3">Published content</h2>
        {published.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing published yet. Content metrics appear once a deliverable is marked published and its numbers are entered.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-3">
              {([['Views', totals.views], ['Likes', totals.likes], ['Comments', totals.comments]] as const).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold tnum">
                    {value == null ? <span className="text-[13px] font-normal text-muted-foreground">Not recorded</span> : formatNum(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {/* State the coverage rather than implying every post is counted. */}
            <p className="mt-2 text-2xs text-muted-foreground">
              Figures cover the {withViews.length} of {published.length} published deliverable{published.length === 1 ? '' : 's'} that have numbers entered.
              Clonify does not read platform metrics automatically.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
