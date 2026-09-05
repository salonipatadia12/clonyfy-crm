'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Handshake, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { useSaveOffer } from '@/lib/queries'
import { OFFER_TYPES, OFFER_STATUSES, OFFER_STATUS_TONE, offerTypeLabel, ccStageLabel } from '@/lib/domain'
import { safeUrl } from '@/lib/utils'
import type { Campaign, CampaignCreator, OfferRow } from '@/types/campaign'
import { DemoBadge } from '@/components/crm/demo'

/**
 * A collaboration's commercial terms, one per campaign creator.
 *
 * Money fields are intentional here: budgeting a campaign and tracking what a
 * creator was offered is the point. Nothing is pre-filled for an existing
 * record — a blank fee reads as "not recorded", never as zero.
 */
export function OfferPanel({ campaign, creators }: { campaign: Campaign; creators: CampaignCreator[] }) {
  const [editing, setEditing] = useState<CampaignCreator | null>(null)
  const withOffers = creators.filter(c => c.offer)

  if (!creators.length) {
    return (
      <EmptyState
        icon={Handshake}
        title="No creators to make an offer to"
        description="Shortlist creators for this campaign first, then record what each one was offered and where the negotiation stands."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted-foreground">
        {withOffers.length} of {creators.length} creators have an offer recorded.
        {campaign.stats.committedSpend != null && (
          <> Committed compensation on accepted offers: <span className="font-medium text-foreground tnum">{campaign.stats.committedSpend} {campaign.stats.currency}</span>.</>
        )}
      </p>
      <ul className="space-y-2">
        {creators.map(c => (
          <li key={c.id} className="surface flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{c.full_name || `@${c.handle}`}</p>
              <p className="truncate text-2xs text-muted-foreground">@{c.handle} · {ccStageLabel(c.stage)}</p>
            </div>
            {c.offer ? <OfferSummary offer={c.offer} /> : <Badge tone="neutral">No offer recorded</Badge>}
            <Button size="sm" variant={c.offer ? 'outline' : 'default'} onClick={() => setEditing(c)}>
              {c.offer ? 'Edit offer' : 'Record offer'}
            </Button>
          </li>
        ))}
      </ul>
      {editing && <OfferModal campaign={campaign} creator={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function OfferSummary({ offer }: { offer: OfferRow }) {
  const url = safeUrl(offer.agreement_url)
  const money = [
    offer.flat_fee != null ? `${offer.flat_fee} ${offer.currency}` : null,
    offer.commission_pct != null ? `${offer.commission_pct}%` : null,
    offer.gifted_product,
  ].filter(Boolean).join(' + ')
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="outline">{offerTypeLabel(offer.offer_type)}</Badge>
      {money && <Badge tone="neutral">{money}</Badge>}
      <Badge tone={OFFER_STATUS_TONE[offer.status] ?? 'neutral'}>
        {OFFER_STATUSES.find(s => s.value === offer.status)?.label ?? offer.status}
      </Badge>
      {offer.whitelisting && <Badge tone="outline">Whitelisting</Badge>}
      <DemoBadge on={offer.demo_run_id} />
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs text-primary hover:underline">
          Agreement<ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  )
}

export function OfferModal({ campaign, creator, onClose }: {
  campaign: Campaign; creator: CampaignCreator; onClose: () => void
}) {
  const save = useSaveOffer()
  const existing = creator.offer
  const [form, setForm] = useState({
    // A new offer inherits the campaign's default shape but no amounts are
    // invented — a blank stays blank.
    offer_type: existing?.offer_type ?? campaign.offer_type ?? 'gifted',
    flat_fee: existing?.flat_fee != null ? String(existing.flat_fee) : '',
    commission_pct: existing?.commission_pct != null ? String(existing.commission_pct) : '',
    gifted_product: existing?.gifted_product ?? campaign.offer_gifted_product ?? '',
    currency: existing?.currency ?? campaign.offer_currency ?? 'USD',
    status: existing?.status ?? 'draft',
    agreed_at: existing?.agreed_at ?? '',
    agreement_url: existing?.agreement_url ?? '',
    usage_rights: existing?.usage_rights ?? campaign.usage_rights ?? '',
    exclusivity: existing?.exclusivity ?? '',
    whitelisting: existing?.whitelisting ?? campaign.whitelisting,
    notes: existing?.notes ?? '',
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    try {
      await save.mutateAsync({ campaign_creator_id: creator.id, ...form })
      toast.success('Offer saved.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the offer.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      size="lg"
      title={`Offer for @${creator.handle}`}
      description={`${campaign.name}${campaign.product_name ? ` · ${campaign.product_name}` : ''}. Marking an offer accepted also moves this creator to Agreed on the board.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save offer'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Offer type">
            <Select value={form.offer_type} onChange={e => set('offer_type', e.target.value)}>
              {OFFER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Labelled>
          <Labelled label="Negotiation status">
            <Select value={form.status} onChange={e => set('status', e.target.value)}>
              {OFFER_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Labelled>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Labelled label="Flat fee" hint="Leave blank if none">
            <Input inputMode="decimal" value={form.flat_fee} onChange={e => set('flat_fee', e.target.value)} />
          </Labelled>
          <Labelled label="Commission %" hint="Leave blank if none">
            <Input inputMode="decimal" value={form.commission_pct} onChange={e => set('commission_pct', e.target.value)} />
          </Labelled>
          <Labelled label="Currency">
            <Select value={form.currency} onChange={e => set('currency', e.target.value)}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Labelled>
        </div>
        <Labelled label="Gifted product">
          <Input value={form.gifted_product} onChange={e => set('gifted_product', e.target.value)} />
        </Labelled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Agreed date"><Input type="date" value={form.agreed_at} onChange={e => set('agreed_at', e.target.value)} /></Labelled>
          <Labelled label="Agreement URL"><Input inputMode="url" value={form.agreement_url} onChange={e => set('agreement_url', e.target.value)} /></Labelled>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Usage rights"><Textarea rows={2} value={form.usage_rights} onChange={e => set('usage_rights', e.target.value)} /></Labelled>
          <Labelled label="Exclusivity"><Textarea rows={2} value={form.exclusivity} onChange={e => set('exclusivity', e.target.value)} /></Labelled>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox label="Whitelisting agreed" checked={form.whitelisting} onChange={e => set('whitelisting', e.target.checked)} />
          Whitelisting / creator-handle ads agreed
        </label>
        <Labelled label="Notes"><Textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></Labelled>
      </div>
    </Modal>
  )
}
