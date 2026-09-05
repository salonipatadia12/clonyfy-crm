'use client'

import { Suspense, use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Search, Users, Send, Handshake, PackageCheck, BarChart3, Settings2,
  RefreshCw, ExternalLink, Trash2,
} from 'lucide-react'
import {
  useCampaignDetail, useUpdateCampaignV2, useDeleteCampaignV2, useRescoreCampaign,
  useDeliverables,
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
  CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONE, OBJECTIVES, offerTypeLabel, ccStageLabel,
} from '@/lib/domain'
import { briefFromCampaign, briefIsEmpty } from '@/lib/match'
import { formatNum, nicheLabel, platformLabel, safeUrl } from '@/lib/utils'
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
  const rescore = useRescoreCampaign()
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
            <Button asChild size="sm"><Link href={findHref}><Search className="h-3.5 w-3.5" aria-hidden />Find creators</Link></Button>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Creators', s.creators], ['Contacted', s.contacted], ['Replied', s.replied],
          ['Agreed', s.agreed], ['Live', s.live], ['Published', s.deliverablesPublished],
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
          <TabsTrigger value="creators"><Users className="mr-1 h-3.5 w-3.5" aria-hidden />Creators ({s.creators})</TabsTrigger>
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
            onRescore={() => rescore.mutate(c.id, {
              onSuccess: r => toast.success(`Re-scored ${r.rescored} creator${r.rescored === 1 ? '' : 's'} against the current brief.`),
              onError: e => toast.error(e.message),
            })}
            rescoring={rescore.isPending}
            onDelete={() => {
              if (!confirm(`Delete "${c.name}"? Its creator relationships, offers and deliverables are deleted with it. The creators themselves stay in the catalog.`)) return
              del.mutate(c.id, { onSuccess: () => { toast.success('Campaign deleted.'); router.push('/campaigns') }, onError: e => toast.error(e.message) })
            }}
          />
        </TabsContent>

        <TabsContent value="creators">
          {creators.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No creators in this campaign yet"
              description="Search the catalog with this campaign's brief applied. Each creator you add gets their own stage here — adding someone to this campaign does not touch their stage in any other."
              actions={<Button asChild size="sm"><Link href={findHref}>Find creators for this campaign</Link></Button>}
            />
          ) : (
            <CampaignBoard creators={creators} members={members} onOpenCreator={setOpenCreator} />
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
      <dt className="w-40 shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px]">{children}</dd>
    </div>
  )
}
const None = () => <span className="text-muted-foreground">Not set</span>

function Overview({ campaign: c, isAdmin, onStatus, onRescore, rescoring, onDelete }: {
  campaign: Campaign; isAdmin: boolean
  onStatus: (v: string) => void
  onRescore: () => void
  rescoring: boolean
  onDelete: () => void
}) {
  const brief = briefFromCampaign(c)
  const noBrief = briefIsEmpty(brief)
  const tracking = safeUrl(c.tracking_url)
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {noBrief && (
        <div className="lg:col-span-2">
          <EmptyState
            compact
            title="This campaign has no creator brief"
            description="Without target niches, a follower range or a geography requirement there is nothing to match creators against, so fit scores stay blank. Add a brief and re-score."
          />
        </div>
      )}

      <section className="surface p-4">
        <h2 className="section-title mb-2">Creator brief</h2>
        <dl className="divide-y divide-border">
          <Row label="Objective">{OBJECTIVES.find(o => o.value === c.objective)?.label ?? <None />}</Row>
          {c.objective_note && <Row label="Success looks like">{c.objective_note}</Row>}
          <Row label="Niches">
            {c.brief_niches?.length
              ? <span className="flex flex-wrap gap-1">{c.brief_niches.map(n => <Badge key={n} tone="outline">{nicheLabel(n)}</Badge>)}</span>
              : <None />}
          </Row>
          <Row label="Follower range">
            {c.brief_min_followers == null && c.brief_max_followers == null
              ? <None />
              : <span className="tnum">{formatNum(c.brief_min_followers ?? 0)} – {c.brief_max_followers == null ? 'any' : formatNum(c.brief_max_followers)}</span>}
          </Row>
          <Row label="Geography">
            {c.brief_geo === 'us_only' ? 'US only' : c.brief_geo === 'us_preferred' ? 'US preferred' : 'Anywhere'}
          </Row>
          <Row label="Platforms">
            {c.brief_platforms?.length
              ? <span className="flex flex-wrap gap-1">{c.brief_platforms.map(p => <Badge key={p} tone="outline">{platformLabel(p)}</Badge>)}</span>
              : <None />}
          </Row>
          <Row label="Contact preference">{c.brief_contact_pref === 'any' || !c.brief_contact_pref ? 'Any channel' : c.brief_contact_pref}</Row>
          <Row label="Creator target">{c.brief_creator_target ? <span className="tnum">{c.brief_creator_target}</span> : <None />}</Row>
          {c.brief_exclusions && <Row label="Exclusions">{c.brief_exclusions}</Row>}
          {c.brief_notes && <Row label="Notes">{c.brief_notes}</Row>}
        </dl>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRescore} disabled={rescoring}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {rescoring ? 'Re-scoring…' : 'Re-score creators against this brief'}
        </Button>
      </section>

      <section className="surface p-4">
        <h2 className="section-title mb-2">Offer &amp; deliverables</h2>
        <dl className="divide-y divide-border">
          <Row label="Default offer">{offerTypeLabel(c.offer_type)}</Row>
          <Row label="Flat fee">{c.offer_flat_fee == null ? <None /> : <span className="tnum">{c.offer_flat_fee} {c.offer_currency}</span>}</Row>
          <Row label="Commission">{c.offer_commission_pct == null ? <None /> : <span className="tnum">{c.offer_commission_pct}%</span>}</Row>
          <Row label="Gifted product">{c.offer_gifted_product ?? <None />}</Row>
          <Row label="Budget">{c.budget_total == null ? <span className="text-muted-foreground">Not recorded</span> : <span className="tnum">{c.budget_total} {c.offer_currency}</span>}</Row>
          <Row label="Committed so far">
            {c.stats.committedSpend == null
              ? <span className="text-muted-foreground">No accepted offers with a fee</span>
              : <span className="tnum">{c.stats.committedSpend} {c.stats.currency}</span>}
          </Row>
          <Row label="Planned deliverables">
            {c.deliverable_plan.length === 0
              ? <None />
              : <span className="flex flex-wrap gap-1">
                  {c.deliverable_plan.map((d, i) => <Badge key={i} tone="outline">{d.quantity}× {d.kind} ({platformLabel(d.platform)})</Badge>)}
                </span>}
          </Row>
          <Row label="Usage rights">{c.usage_rights ?? <None />}</Row>
          <Row label="Whitelisting">{c.whitelisting ? 'Required' : 'Not required'}</Row>
          <Row label="Approval">{c.approval_required ? 'Required before publishing' : 'Not required'}</Row>
        </dl>
      </section>

      <section className="surface p-4">
        <h2 className="section-title mb-2">Messaging &amp; tracking</h2>
        <dl className="divide-y divide-border">
          <Row label="Talking points">
            {c.talking_points?.length
              ? <ul className="list-inside list-disc space-y-0.5">{c.talking_points.map(t => <li key={t}>{t}</li>)}</ul>
              : <None />}
          </Row>
          <Row label="Call to action">{c.cta ?? <None />}</Row>
          <Row label="Discount code">{c.discount_code ?? <None />}</Row>
          <Row label="Tracking URL">
            {tracking
              ? <a href={tracking} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{tracking}<ExternalLink className="h-3 w-3" aria-hidden /></a>
              : <None />}
          </Row>
          <Row label="Hashtags">
            {c.hashtags?.length ? <span className="flex flex-wrap gap-1">{c.hashtags.map(h => <Badge key={h} tone="outline">#{h}</Badge>)}</span> : <None />}
          </Row>
          <Row label="Required disclosure">{c.disclosure_required ?? <None />}</Row>
          <Row label="Prohibited language">{c.prohibited_language ?? <None />}</Row>
        </dl>
      </section>

      <section className="surface p-4">
        <h2 className="section-title mb-2">Campaign settings</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[160px] space-y-1">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">Status</span>
            <Select value={c.status} onChange={e => onStatus(e.target.value)} disabled={!isAdmin}>
              {Object.entries(CAMPAIGN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
          {!isAdmin && <p className="text-2xs text-muted-foreground">Only an admin can change campaign settings.</p>}
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" className="mt-3 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete campaign
          </Button>
        )}
      </section>
    </div>
  )
}

/* ---------------------------------------------------------- deliverables */

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
                  <span className="w-40 shrink-0 text-[13px]">{ccStageLabel(stage)}</span>
                  <span className="h-2 rounded-full bg-primary" style={{ width: `${(n / creators.length) * 100}%`, minWidth: 4 }} />
                  <span className="text-2xs tnum text-muted-foreground">{n}</span>
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
