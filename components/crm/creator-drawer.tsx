'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ExternalLink, Mail, Phone, Plus, Target, History, Send, MessageSquare,
  ShieldCheck, Copy, Check,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import {
  GeoBadge, EntityBadge, QualificationBadge, ContactBadge, ProfileLink, NicheChip, Followers,
} from '@/components/crm/creator-badges'
import { useCreator, useCampaignList, useAddCreatorsToCampaign, useReviewCreator, useUpdateCampaignCreator } from '@/lib/queries'
import { useIsAdmin } from '@/lib/auth-context'
import { scoreMatch, briefFromCampaign, briefIsEmpty, scoreTone, type MatchReason } from '@/lib/match'
import {
  ccStageLabel, channelLabel, replyStatusLabel, relativeDate, linkLabelFor, entityLabel,
  qualificationHelp, ORGANISATION_ENTITY_TYPES,
} from '@/lib/domain'
import { safeUrl, nicheLabel, platformLabel } from '@/lib/utils'
import type { CreatorRow, CampaignCreator, CreatorReviewRow } from '@/types/campaign'

export function CreatorDrawer({
  creatorId, campaignId, onOpenChange,
}: {
  creatorId: string | null
  /** When opened from a campaign board, Product fit scores against that campaign. */
  campaignId?: string
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, error, refetch } = useCreator(creatorId)
  const creator = data?.creator

  return (
    <Sheet open={!!creatorId} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[640px]"
        title={creator ? (creator.full_name || `@${creator.handle}`) : 'Creator profile'}
        description={creator
          ? `@${creator.handle} · ${platformLabel(creator.platform)} · ${nicheLabel(creator.niche)}`
          : 'Loading this creator’s profile, campaign history and outreach.'}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Shimmer className="h-20 rounded-lg" />
              <Shimmer className="h-8 w-64" />
              <Shimmer className="h-56 rounded-lg" />
            </div>
          ) : error ? (
            <div className="p-4"><ErrorState error={error} onRetry={() => refetch()} /></div>
          ) : data ? (
            <CreatorBody data={data} campaignId={campaignId} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CreatorBody({ data, campaignId }: {
  data: NonNullable<ReturnType<typeof useCreator>['data']>
  campaignId?: string
}) {
  const { creator, memberships, outreach, comments, activity } = data
  return (
    <div>
      <ProfileHeader creator={creator} memberships={memberships} defaultCampaignId={campaignId} />
      <Tabs defaultValue={campaignId ? 'fit' : 'overview'} className="px-4 pb-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fit"><Target className="mr-1 h-3.5 w-3.5" aria-hidden />Product fit</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" aria-hidden />Campaigns ({memberships.length})</TabsTrigger>
          <TabsTrigger value="outreach"><Send className="mr-1 h-3.5 w-3.5" aria-hidden />Outreach ({outreach.length})</TabsTrigger>
          <TabsTrigger value="notes"><MessageSquare className="mr-1 h-3.5 w-3.5" aria-hidden />Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><Overview creator={creator} reviews={data.reviews ?? []} /></TabsContent>
        <TabsContent value="fit"><ProductFit creator={creator} memberships={memberships} defaultCampaignId={campaignId} /></TabsContent>
        <TabsContent value="history"><CampaignHistory memberships={memberships} /></TabsContent>
        <TabsContent value="outreach"><OutreachHistory rows={outreach} /></TabsContent>
        <TabsContent value="notes"><NotesAndActivity comments={comments} activity={activity} /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------------------------------------------------------- header */

function ProfileHeader({ creator, memberships, defaultCampaignId }: {
  creator: CreatorRow; memberships: CampaignCreator[]; defaultCampaignId?: string
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-3 border-b border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{platformLabel(creator.platform)}</Badge>
        <QualificationBadge status={creator.qualification_status} />
        <EntityBadge type={creator.entity_type} />
        <GeoBadge status={creator.geo_status} evidence={creator.geo_evidence} />
        <ContactBadge
          contactStatus={creator.contact_status} email={creator.email} phone={creator.phone}
          profileUrl={creator.profile_url} verification={creator.verification_status}
        />
        {creator.verification_status === 'pending_instagram_verification' && (
          <Badge tone="warning">Instagram profile not yet verified</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-muted-foreground">
          Profile completeness <span className="font-medium text-foreground tnum">{creator.profile_completeness}/8</span>
        </span>
        <span className="text-muted-foreground">
          Last verified <span className="font-medium text-foreground">{relativeDate(creator.last_verified_at)}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <ProfileLink url={creator.profile_url} className="text-[13px]" />
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add to campaign
        </Button>
      </div>

      <AddOne
        open={adding}
        onOpenChange={setAdding}
        creator={creator}
        alreadyIn={new Set(memberships.map(m => m.campaign_id))}
        defaultCampaignId={defaultCampaignId}
      />
    </div>
  )
}

function AddOne({ open, onOpenChange, creator, alreadyIn, defaultCampaignId }: {
  open: boolean; onOpenChange: (o: boolean) => void; creator: CreatorRow
  alreadyIn: Set<string>; defaultCampaignId?: string
}) {
  const { data: campaigns } = useCampaignList()
  const add = useAddCreatorsToCampaign()
  const [id, setId] = useState(defaultCampaignId ?? '')
  if (!open) return null
  const available = (campaigns ?? []).filter(c => !alreadyIn.has(c.id))
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {available.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {campaigns?.length
            ? 'This creator is already in every campaign you have.'
            : 'No campaigns yet. Create one for a client product first.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Campaign</span>
            <Select value={id} onChange={e => setId(e.target.value)}>
              <option value="">Choose…</option>
              {available.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.product_name ? ` — ${c.product_name}` : ''}</option>
              ))}
            </Select>
          </label>
          <Button
            size="sm"
            disabled={!id || add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync({ campaignId: id, influencerIds: [creator.id], stage: 'shortlisted', source: 'profile' })
                toast.success('Shortlisted for that campaign.')
                onOpenChange(false)
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add.') }
            }}
          >
            Shortlist
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- overview */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[13px] text-foreground">{children}</dd>
    </div>
  )
}
const NotRecorded = () => <span className="text-muted-foreground">Not recorded</span>

function Overview({ creator, reviews }: { creator: CreatorRow; reviews: CreatorReviewRow[] }) {
  const isAdmin = useIsAdmin()
  const bio = safeUrl(creator.bio_link)

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4">
        <Field label="Followers"><Followers count={creator.follower_count} /></Field>
        <Field label="Niche"><NicheChip niche={creator.niche} /></Field>
        <Field label="Platform">{platformLabel(creator.platform)}</Field>
        <Field label="Verified on platform">{creator.is_verified ? 'Yes' : 'No badge recorded'}</Field>
      </dl>

      <div className="space-y-1">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Biography</p>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
          {creator.biography || <NotRecorded />}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Public contact details</p>
        <div className="space-y-1.5">
          {creator.email ? (
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <a href={`mailto:${creator.email}`} className="text-primary hover:underline">{creator.email}</a>
              {creator.email_type && <Badge tone="neutral">{creator.email_type.replace(/_/g, ' ')}</Badge>}
              <CopyButton value={creator.email} label="email" />
            </p>
          ) : <p className="text-[13px] text-muted-foreground">No public email recorded.</p>}
          {creator.phone ? (
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span>{creator.phone}</span>
              {creator.phone_type && <Badge tone="neutral">{creator.phone_type}</Badge>}
              <CopyButton value={creator.phone} label="phone number" />
            </p>
          ) : <p className="text-[13px] text-muted-foreground">No public phone recorded. Phone is optional for outreach.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Links</p>
        <div className="flex flex-col gap-1">
          <ProfileLink url={creator.profile_url} className="text-[13px]" />
          {bio ? (
            <a href={bio} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-[13px] text-primary hover:underline">
              {/* Labelled by host: bio links routinely point at YouTube, Facebook or Linktree. */}
              Bio link · {linkLabelFor(bio)}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : <span className="text-[13px] text-muted-foreground">No bio link recorded.</span>}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Data quality
        </p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Qualification"><QualificationBadge status={creator.qualification_status} /></Field>
          <Field label="Classification"><EntityBadge type={creator.entity_type} /></Field>
          <Field label="Geography"><GeoBadge status={creator.geo_status} evidence={creator.geo_evidence} /></Field>
          <Field label="Source">{creator.source || <NotRecorded />}</Field>
          <Field label="Source language code">
            {/* Shown as a language, never as a country — this is where 'en'/'fr' live now. */}
            {creator.language_code ? <Badge tone="neutral">{creator.language_code.toUpperCase()} (language, not geography)</Badge> : <NotRecorded />}
          </Field>
          <Field label="Country field">{creator.country || <NotRecorded />}</Field>
        </dl>
        {creator.geo_evidence && (
          <p className="text-2xs leading-relaxed text-muted-foreground">{creator.geo_evidence}</p>
        )}

        {creator.entity_evidence && (
          <p className="text-2xs leading-relaxed text-muted-foreground">{creator.entity_evidence}</p>
        )}
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {qualificationHelp(creator.qualification_status)}
        </p>

        {isAdmin && <ReviewActions creator={creator} />}
        <ReviewHistory reviews={reviews} />
      </div>
    </div>
  )
}

/**
 * Named review decisions rather than a raw enum dropdown.
 *
 * Each button states the assertion it records ("this is a person", "this is a
 * company"), because the operator is being asked to vouch for the record — the
 * previous select made that look like editing a field. Every decision writes a
 * `creator_reviews` row with the actor, timestamp, previous state and new state.
 */
function ReviewActions({ creator }: { creator: CreatorRow }) {
  const review = useReviewCreator()
  const [reason, setReason] = useState('')

  const apply = (patch: { entity_type?: string; review_state?: string }, done: string) =>
    review.mutate({ id: creator.id, ...patch, reason: reason.trim() || undefined }, {
      onSuccess: () => { toast.success(done); setReason('') },
      onError: err => toast.error(err.message),
    })

  const isOrg = ORGANISATION_ENTITY_TYPES.includes(
    creator.entity_type as (typeof ORGANISATION_ENTITY_TYPES)[number])

  return (
    <div className="space-y-2.5 border-t border-border pt-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Review this record
      </p>
      <Input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason (optional) — kept on the audit trail"
        aria-label="Reason for this review decision"
        className="h-8 text-[13px]"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={creator.review_state === 'approved' ? 'success' : 'outline'}
          disabled={review.isPending}
          onClick={() => apply({ entity_type: 'individual_creator', review_state: 'approved' },
            'Approved as an individual creator.')}>
          {creator.review_state === 'approved' && <Check className="h-3.5 w-3.5" aria-hidden />}
          Approve as individual creator
        </Button>
        <Button size="sm" variant={isOrg && creator.entity_source === 'human' ? 'secondary' : 'outline'}
          disabled={review.isPending}
          onClick={() => apply({ entity_type: 'brand', review_state: 'unreviewed' },
            'Marked as an organisation or brand.')}>
          Mark as organisation / brand
        </Button>
        <Button size="sm" variant={creator.entity_type === 'aggregator' && creator.entity_source === 'human' ? 'secondary' : 'outline'}
          disabled={review.isPending}
          onClick={() => apply({ entity_type: 'aggregator', review_state: 'unreviewed' },
            'Marked as an aggregator or feed.')}>
          Mark as aggregator / feed
        </Button>
        <Button size="sm" variant={creator.review_state === 'rejected' ? 'danger' : 'outline'}
          disabled={review.isPending}
          onClick={() => apply({ review_state: 'rejected' }, 'Rejected.')}>
          Reject
        </Button>
        {(creator.review_state !== 'unreviewed' || creator.entity_source === 'human') && (
          <Button size="sm" variant="ghost" disabled={review.isPending}
            onClick={() => apply({ entity_type: 'unclassified', review_state: 'unreviewed' },
              'Returned to unreviewed.')}>
            Return to unreviewed
          </Button>
        )}
      </div>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Approving asserts a person checked this account and it belongs to an individual.
        Nothing here changes the creator&rsquo;s handle, followers, contact details or source evidence.
      </p>
    </div>
  )
}

function ReviewHistory({ reviews }: { reviews: CreatorReviewRow[] }) {
  if (!reviews.length) return null
  return (
    <div className="space-y-2">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Review history</p>
      <ul className="space-y-1.5">
        {reviews.map(r => (
          <li key={r.id} className="rounded-md border border-border px-2.5 py-1.5 text-2xs leading-relaxed">
            <span className="font-medium">{r.actor_name || 'Someone'}</span>{' '}
            <span className="text-muted-foreground">
              changed classification {entityLabel(r.prev_entity_type)} &rarr; {entityLabel(r.new_entity_type)}
              {r.prev_review_state !== r.new_review_state &&
                ` and review state ${r.prev_review_state} \u2192 ${r.new_review_state}`}
              {' · '}{relativeDate(r.created_at)}
            </span>
            {r.reason && <p className="mt-0.5 text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true); setTimeout(() => setDone(false), 1500)
        } catch { toast.error('Your browser blocked clipboard access.') }
      }}
      className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {done ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {done ? 'Copied' : 'Copy'}
      <span className="sr-only"> {label}</span>
    </button>
  )
}

/* ----------------------------------------------------------- product fit */

function ProductFit({ creator, memberships, defaultCampaignId }: {
  creator: CreatorRow; memberships: CampaignCreator[]; defaultCampaignId?: string
}) {
  const { data: campaigns } = useCampaignList()
  const [id, setId] = useState(defaultCampaignId ?? memberships[0]?.campaign_id ?? '')
  const campaign = (campaigns ?? []).find(c => c.id === id)
  const membership = memberships.find(m => m.campaign_id === id)
  const add = useAddCreatorsToCampaign()
  const update = useUpdateCampaignCreator()

  const result = useMemo(() => {
    if (!campaign) return null
    return scoreMatch({
      niche: creator.niche, follower_count: creator.follower_count, geo_status: creator.geo_status,
      platform: creator.platform, contact_status: creator.contact_status, email: creator.email,
      phone: creator.phone, profile_url: creator.profile_url, entity_type: creator.entity_type,
      qualification_status: creator.qualification_status, verification_status: creator.verification_status,
    }, briefFromCampaign(campaign))
  }, [campaign, creator])

  // Previous work for the same client is a real signal, and it comes from rows.
  const priorForClient = campaign?.client_id
    ? memberships.filter(m => m.campaign_id !== id && m.client_name && m.client_name === campaign.client_name)
    : []

  if (!campaigns?.length) {
    return (
      <EmptyState
        icon={Target}
        title="No campaigns to score against"
        description="Fit is measured against a specific campaign's creator brief. Create a campaign for a client product and this tab will explain why this creator does or doesn't fit it."
        actions={<Button asChild size="sm"><Link href="/campaigns/new">Create a campaign</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Score against</span>
        <Select value={id} onChange={e => setId(e.target.value)}>
          <option value="">Choose a campaign…</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.product_name ? ` — ${c.product_name}` : ''}{c.client_name ? ` (${c.client_name})` : ''}
            </option>
          ))}
        </Select>
      </label>

      {!campaign ? (
        <p className="text-[13px] text-muted-foreground">Pick a campaign to see how this creator matches its brief.</p>
      ) : briefIsEmpty(briefFromCampaign(campaign)) ? (
        <EmptyState
          compact
          title="This campaign has no creator brief yet"
          description="Add target niches, a follower range and a geography requirement to the campaign and the fit here becomes meaningful. Without criteria there is nothing honest to score."
          actions={<Button asChild size="sm" variant="outline"><Link href={`/campaigns/${campaign.id}`}>Edit the brief</Link></Button>}
        />
      ) : result && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Fit score</p>
              <p className="text-2xl font-semibold tnum">{result.score == null ? '—' : `${result.score}%`}</p>
            </div>
            <p className="min-w-[180px] flex-1 text-2xs leading-relaxed text-muted-foreground">
              Calculated from this creator&apos;s stored fields against the campaign brief. It is arithmetic over the
              reasons below, not a prediction — every point is traceable to a column.
            </p>
            <Badge tone={scoreTone(result.score) === 'success' ? 'success' : scoreTone(result.score) === 'info' ? 'info' : 'warning'}>
              {campaign.name}
            </Badge>
          </div>

          {result.blockers.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-destructive">Excluded by this campaign</p>
              {result.blockers.map((r, i) => <ReasonRow key={i} reason={r} />)}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Why this score</p>
            {result.reasons.map((r, i) => <ReasonRow key={i} reason={r} />)}
          </div>

          <div className="space-y-1.5 rounded-lg border border-border p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Previous work for this client</p>
            {priorForClient.length === 0
              ? <p className="text-[13px] text-muted-foreground">No previous campaign for {campaign.client_name ?? 'this client'}.</p>
              : (
                <ul className="space-y-1 text-[13px]">
                  {priorForClient.map(m => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.campaign_name}</span>
                      <Badge tone="neutral">{ccStageLabel(m.stage)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className="flex flex-wrap gap-2">
            {membership ? (
              <>
                <Badge tone="info">Already in this campaign · {ccStageLabel(membership.stage)}</Badge>
                <Button
                  size="sm" variant="outline"
                  onClick={() => update.mutate({ id: membership.id, patch: { stage: 'shortlisted' } },
                    { onSuccess: () => toast.success('Moved to shortlisted.'), onError: e => toast.error(e.message) })}
                >
                  Move to shortlist
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => update.mutate({ id: membership.id, patch: { stage: 'rejected' } },
                    { onSuccess: () => toast.success('Rejected for this campaign. Other campaigns are unaffected.'), onError: e => toast.error(e.message) })}
                >
                  Reject for this campaign
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={add.isPending}
                onClick={() => add.mutate({ campaignId: campaign.id, influencerIds: [creator.id], stage: 'shortlisted', source: 'profile' },
                  { onSuccess: () => toast.success('Added to the shortlist.'), onError: e => toast.error(e.message) })}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add to shortlist
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ReasonRow({ reason }: { reason: MatchReason }) {
  const tone = reason.kind === 'positive' ? 'success'
    : reason.kind === 'blocker' ? 'danger'
    : reason.kind === 'negative' ? 'neutral' : 'warning'
  return (
    <div className="flex items-start gap-2 py-1">
      <Badge tone={tone}>{reason.label}</Badge>
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">{reason.detail}</p>
      {reason.points > 0 && <span className="shrink-0 text-2xs text-muted-foreground tnum">+{reason.points}</span>}
    </div>
  )
}

/* -------------------------------------------------------- campaign history */

function CampaignHistory({ memberships }: { memberships: CampaignCreator[] }) {
  if (!memberships.length) {
    return (
      <EmptyState
        compact
        icon={History}
        title="Not used in any campaign yet"
        description="Once this creator is shortlisted for a campaign, every campaign they appear in is listed here with its own stage, offer and deliverables."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {memberships.map(m => (
        <li key={m.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/campaigns/${m.campaign_id}`} className="text-[13px] font-medium text-primary hover:underline">
                {m.campaign_name}
              </Link>
              <p className="text-2xs text-muted-foreground">
                {[m.client_name, m.product_name].filter(Boolean).join(' · ') || 'No client/product linked'}
              </p>
            </div>
            <Badge tone="info">{ccStageLabel(m.stage)}</Badge>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Owner</dt><dd>{m.owner_name ?? 'Unassigned'}</dd></div>
            <div><dt className="text-muted-foreground">Offer</dt><dd>{m.offer ? `${m.offer.offer_type.replace(/_/g, ' ')} · ${m.offer.status}` : 'None yet'}</dd></div>
            <div><dt className="text-muted-foreground">Deliverables</dt><dd className="tnum">{m.deliverables_published}/{m.deliverables_total || '0'} published</dd></div>
            <div><dt className="text-muted-foreground">Fit</dt><dd className="tnum">{m.match_score == null ? 'Not scored' : `${m.match_score}%`}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

/* --------------------------------------------------------------- outreach */

function OutreachHistory({ rows }: { rows: NonNullable<ReturnType<typeof useCreator>['data']>['outreach'] }) {
  if (!rows.length) {
    return (
      <EmptyState
        compact
        icon={Send}
        title="No outreach logged"
        description="Clonify does not send messages. When you DM or email this creator, log it from the campaign board so the history, replies and follow-ups stay in one place."
      />
    )
  }
  return (
    <ol className="space-y-2">
      {rows.map(o => (
        <li key={o.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={o.direction === 'inbound' ? 'success' : 'info'}>
                {o.direction === 'inbound' ? 'Reply received' : channelLabel(o.channel)}
              </Badge>
              {o.campaign_name && <Badge tone="outline">{o.campaign_name}</Badge>}
            </span>
            <span className="text-2xs text-muted-foreground">{relativeDate(o.occurred_at)}</span>
          </div>
          {o.subject && <p className="mt-1.5 text-[13px] font-medium">{o.subject}</p>}
          {o.body && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{o.body}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span>{replyStatusLabel(o.reply_status)}</span>
            {o.next_follow_up && <span>· Follow up {o.next_follow_up}</span>}
            {o.logged_by_name && <span>· Logged by {o.logged_by_name}</span>}
          </p>
          {o.notes && <p className="mt-1 text-2xs italic text-muted-foreground">{o.notes}</p>}
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ notes */

function NotesAndActivity({ comments, activity }: {
  comments: NonNullable<ReturnType<typeof useCreator>['data']>['comments']
  activity: NonNullable<ReturnType<typeof useCreator>['data']>['activity']
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Team notes</h3>
        {comments.length === 0
          ? <p className="text-[13px] text-muted-foreground">No notes on this creator yet.</p>
          : (
            <ul className="space-y-2">
              {comments.map(c => (
                <li key={c.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author_name ?? 'Someone'}</span>
                    <span>{relativeDate(c.created_at)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px]">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
      </section>
      <section className="space-y-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
        {activity.length === 0
          ? <p className="text-[13px] text-muted-foreground">Nothing recorded yet.</p>
          : (
            <ul className="space-y-1">
              {activity.map(a => (
                <li key={a.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.user_name ?? 'Someone'}</span>{' '}
                    <span className="text-muted-foreground">{a.action.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="shrink-0 text-2xs text-muted-foreground">{relativeDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
