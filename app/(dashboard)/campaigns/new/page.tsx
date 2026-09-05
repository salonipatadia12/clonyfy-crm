'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react'
import { useClients, useProducts, useCreateCampaignV2, useCreatorFacets } from '@/lib/queries'
import { useMembers } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Labelled, ChipGroup } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/table'
import { EmptyState, Shimmer } from '@/components/ui/states'
import { OBJECTIVES, OFFER_TYPES, DELIVERABLE_KINDS } from '@/lib/domain'
import { nicheLabel, platformLabel, cn } from '@/lib/utils'
import type { DeliverablePlanItem } from '@/types/campaign'

const STEPS = [
  { key: 'basics', label: 'Basics', hint: 'Who and what this campaign is for.' },
  { key: 'objective', label: 'Objective', hint: 'What success means.' },
  { key: 'brief', label: 'Creator brief', hint: 'Who you want to work with. This drives creator matching.' },
  { key: 'offer', label: 'Offer', hint: 'What creators get.' },
  { key: 'deliverables', label: 'Deliverables', hint: 'What creators produce.' },
  { key: 'messaging', label: 'Messaging & tracking', hint: 'What creators say and how you measure it.' },
] as const
type StepKey = (typeof STEPS)[number]['key']

interface Form {
  name: string; client_id: string; product_id: string; owner_id: string
  status: string; start_date: string; end_date: string
  objective: string; objective_note: string
  brief_niches: string[]; brief_min_followers: string; brief_max_followers: string
  brief_geo: string; brief_platforms: string[]; brief_entity_types: string[]
  brief_contact_pref: string; brief_creator_target: string
  brief_exclusions: string; brief_notes: string
  offer_type: string; offer_flat_fee: string; offer_commission_pct: string
  offer_gifted_product: string; offer_currency: string; budget_total: string
  deliverable_plan: DeliverablePlanItem[]
  usage_rights: string; whitelisting: boolean; approval_required: boolean
  talking_points: string; cta: string; discount_code: string; tracking_url: string
  hashtags: string; disclosure_required: string; prohibited_language: string
}

const BLANK: Form = {
  name: '', client_id: '', product_id: '', owner_id: '', status: 'planning', start_date: '', end_date: '',
  objective: 'awareness', objective_note: '',
  brief_niches: [], brief_min_followers: '', brief_max_followers: '', brief_geo: 'any',
  brief_platforms: ['instagram'], brief_entity_types: [], brief_contact_pref: 'any',
  brief_creator_target: '', brief_exclusions: '', brief_notes: '',
  offer_type: 'gifted', offer_flat_fee: '', offer_commission_pct: '', offer_gifted_product: '',
  offer_currency: 'USD', budget_total: '',
  deliverable_plan: [], usage_rights: '', whitelisting: false, approval_required: true,
  talking_points: '', cta: '', discount_code: '', tracking_url: '', hashtags: '',
  disclosure_required: '#ad', prohibited_language: '',
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<Shimmer className="h-96 rounded-xl" />}>
      <NewCampaignInner />
    </Suspense>
  )
}

function NewCampaignInner() {
  const router = useRouter()
  const params = useSearchParams()
  const me = useAuth()
  const clients = useClients()
  const products = useProducts()
  const facets = useCreatorFacets()
  const members = useMembers()
  const create = useCreateCampaignV2()

  const [step, setStep] = useState<StepKey>('basics')
  const [form, setForm] = useState<Form>(() => {
    const productId = params?.get('productId') ?? ''
    return { ...BLANK, product_id: productId, owner_id: me.id }
  })
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  // The client always follows the product so the two can never disagree.
  const product = (products.data ?? []).find(p => p.id === form.product_id)
  const clientId = product?.client_id ?? form.client_id

  const stepIndex = STEPS.findIndex(s => s.key === step)
  const errors = validate(form)
  const canSubmit = errors.length === 0

  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

  const submit = async () => {
    if (!canSubmit) { setStep('basics'); return }
    try {
      const campaign = await create.mutateAsync({
        name: form.name,
        client_id: clientId || null,
        product_id: form.product_id,
        owner_id: form.owner_id || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        objective: form.objective,
        objective_note: form.objective_note || null,
        brief_niches: form.brief_niches,
        brief_min_followers: form.brief_min_followers || null,
        brief_max_followers: form.brief_max_followers || null,
        brief_geo: form.brief_geo,
        brief_platforms: form.brief_platforms,
        brief_entity_types: form.brief_entity_types,
        brief_contact_pref: form.brief_contact_pref,
        brief_creator_target: form.brief_creator_target || null,
        brief_exclusions: form.brief_exclusions || null,
        brief_notes: form.brief_notes || null,
        offer_type: form.offer_type,
        offer_flat_fee: form.offer_flat_fee || null,
        offer_commission_pct: form.offer_commission_pct || null,
        offer_gifted_product: form.offer_gifted_product || null,
        offer_currency: form.offer_currency,
        budget_total: form.budget_total || null,
        deliverable_plan: form.deliverable_plan,
        usage_rights: form.usage_rights || null,
        whitelisting: form.whitelisting,
        approval_required: form.approval_required,
        talking_points: lines(form.talking_points),
        cta: form.cta || null,
        discount_code: form.discount_code || null,
        tracking_url: form.tracking_url || null,
        hashtags: lines(form.hashtags).map(h => h.replace(/^#/, '')),
        disclosure_required: form.disclosure_required || null,
        prohibited_language: form.prohibited_language || null,
      })
      toast.success('Campaign created. Now find creators for it.')
      router.push(`/campaigns/${campaign.id}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create the campaign.') }
  }

  if (products.isLoading || clients.isLoading) return <Shimmer className="h-96 rounded-xl" />

  if (!(products.data ?? []).length) {
    return (
      <div className="space-y-4">
        <PageHeader title="New campaign" />
        <EmptyState
          icon={AlertTriangle}
          title="Add a client and a product first"
          description="A campaign promotes one specific product for one client. Without a product there is nothing to brief creators about, so this form has nothing to attach to."
          actions={<Button asChild size="sm"><Link href="/clients">Go to clients & products</Link></Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="New campaign"
        description="Six short steps. Everything except the name and the product can be changed later."
        actions={<Button asChild variant="ghost" size="sm"><Link href="/campaigns"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Cancel</Link></Button>}
      />

      {/* Step rail */}
      <ol className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Campaign setup steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setStep(s.key)}
              aria-current={step === s.key ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] transition-colors',
                step === s.key
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : i < stepIndex
                    ? 'border-border text-foreground hover:bg-accent'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {i < stepIndex ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tnum text-2xs">{i + 1}</span>}
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="surface p-4 md:p-5">
        <p className="mb-4 text-[13px] text-muted-foreground">{STEPS[stepIndex].hint}</p>

        {step === 'basics' && (
          <div className="grid max-w-2xl gap-3">
            <Labelled label="Campaign name" required hint="How your team will refer to it">
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme CLI — Q4 developer creators" />
            </Labelled>
            <Labelled label="Product" required hint="The client is set automatically from the product">
              <Select value={form.product_id} onChange={e => set('product_id', e.target.value)}>
                <option value="">Choose a product…</option>
                {(clients.data ?? []).map(c => (
                  <optgroup key={c.id} label={c.name}>
                    {(products.data ?? []).filter(p => p.client_id === c.id).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Labelled>
            {product && (
              <p className="text-2xs text-muted-foreground">
                Client: <span className="font-medium text-foreground">{(clients.data ?? []).find(c => c.id === product.client_id)?.name}</span>
                {product.description && <> · {product.description.slice(0, 120)}</>}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Campaign owner">
                <Select value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                  <option value="">Unassigned</option>
                  {(members.data?.members ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Labelled>
              <Labelled label="Status">
                <Select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </Labelled>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Start date"><Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></Labelled>
              <Labelled label="End date"><Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></Labelled>
            </div>
          </div>
        )}

        {step === 'objective' && (
          <div className="grid max-w-2xl gap-3">
            <Labelled label="Primary objective">
              <ChipGroup
                ariaLabel="Campaign objective"
                options={OBJECTIVES.map(o => ({ value: o.value, label: o.label }))}
                value={[form.objective]}
                onChange={next => set('objective', next.find(v => v !== form.objective) ?? form.objective)}
              />
            </Labelled>
            <Labelled label="What does success look like?" hint="Free text — shown on the campaign overview">
              <Textarea rows={3} value={form.objective_note} onChange={e => set('objective_note', e.target.value)}
                placeholder="30 developer creators posting a reel using the CLI, driving signups through the tracked link." />
            </Labelled>
          </div>
        )}

        {step === 'brief' && (
          <div className="grid max-w-3xl gap-4">
            <p className="rounded-lg border border-border bg-muted/50 p-3 text-2xs leading-relaxed text-muted-foreground">
              This brief is what creator fit is scored against. Each criterion you set here becomes a visible,
              explained reason on every creator&apos;s Product fit tab — nothing is scored that you have not asked for.
            </p>
            <Labelled label="Target niches">
              <ChipGroup
                ariaLabel="Target niches"
                options={(facets.data?.niche ?? []).map(n => ({ value: n.value, label: `${nicheLabel(n.value)} (${n.count})` }))}
                value={form.brief_niches}
                onChange={v => set('brief_niches', v)}
              />
            </Labelled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Labelled label="Min followers"><Input inputMode="numeric" value={form.brief_min_followers} onChange={e => set('brief_min_followers', e.target.value)} placeholder="1000" /></Labelled>
              <Labelled label="Max followers"><Input inputMode="numeric" value={form.brief_max_followers} onChange={e => set('brief_max_followers', e.target.value)} placeholder="100000" /></Labelled>
              <Labelled label="Creator count target"><Input inputMode="numeric" value={form.brief_creator_target} onChange={e => set('brief_creator_target', e.target.value)} placeholder="30" /></Labelled>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Geography requirement" hint="Matched against evidence, not a raw country tag">
                <Select value={form.brief_geo} onChange={e => set('brief_geo', e.target.value)}>
                  <option value="any">Anywhere</option>
                  <option value="us_preferred">US preferred</option>
                  <option value="us_only">US only (excludes creators with non-US locations)</option>
                </Select>
              </Labelled>
              <Labelled label="Contact preference" hint="Phone is never required unless you pick it here">
                <Select value={form.brief_contact_pref} onChange={e => set('brief_contact_pref', e.target.value)}>
                  <option value="any">Any channel</option>
                  <option value="instagram">Instagram DM</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </Select>
              </Labelled>
            </div>
            <Labelled label="Platforms">
              <ChipGroup
                ariaLabel="Platforms"
                options={(facets.data?.platform ?? [{ value: 'instagram', count: 0 }]).map(p => ({ value: p.value, label: platformLabel(p.value) }))}
                value={form.brief_platforms}
                onChange={v => set('brief_platforms', v)}
              />
            </Labelled>
            <Labelled label="Account type requirement" hint="Leave empty to allow any; unclassified records still show a review badge">
              <ChipGroup
                ariaLabel="Account types"
                options={[
                  { value: 'individual_creator', label: 'Individual creators only' },
                  { value: 'brand', label: 'Brands' },
                  { value: 'institution', label: 'Institutions' },
                ]}
                value={form.brief_entity_types}
                onChange={v => set('brief_entity_types', v)}
              />
            </Labelled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Exclusion rules" hint="Competitors, previous clients, anything off-limits">
                <Textarea rows={3} value={form.brief_exclusions} onChange={e => set('brief_exclusions', e.target.value)} />
              </Labelled>
              <Labelled label="Notes for the team">
                <Textarea rows={3} value={form.brief_notes} onChange={e => set('brief_notes', e.target.value)} />
              </Labelled>
            </div>
          </div>
        )}

        {step === 'offer' && (
          <div className="grid max-w-2xl gap-3">
            <Labelled label="Default offer type" hint="Each creator's offer can differ; this is the starting point">
              <ChipGroup
                ariaLabel="Offer type"
                options={OFFER_TYPES.map(o => ({ value: o.value, label: o.label }))}
                value={[form.offer_type]}
                onChange={next => set('offer_type', next.find(v => v !== form.offer_type) ?? form.offer_type)}
              />
            </Labelled>
            {(form.offer_type === 'gifted' || form.offer_type === 'custom') && (
              <Labelled label="Gifted product">
                <Input value={form.offer_gifted_product} onChange={e => set('offer_gifted_product', e.target.value)} placeholder="12-month Pro licence" />
              </Labelled>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(form.offer_type === 'flat_fee' || form.offer_type === 'flat_plus_commission' || form.offer_type === 'custom') && (
                <Labelled label="Flat fee per creator"><Input inputMode="decimal" value={form.offer_flat_fee} onChange={e => set('offer_flat_fee', e.target.value)} /></Labelled>
              )}
              {(form.offer_type === 'commission' || form.offer_type === 'flat_plus_commission' || form.offer_type === 'custom') && (
                <Labelled label="Commission %"><Input inputMode="decimal" value={form.offer_commission_pct} onChange={e => set('offer_commission_pct', e.target.value)} /></Labelled>
              )}
              <Labelled label="Currency">
                <Select value={form.offer_currency} onChange={e => set('offer_currency', e.target.value)}>
                  {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Labelled>
            </div>
            <Labelled label="Total budget" hint="Optional. Leave blank if there is no agreed number yet — it will show as not recorded rather than zero.">
              <Input inputMode="decimal" value={form.budget_total} onChange={e => set('budget_total', e.target.value)} />
            </Labelled>
          </div>
        )}

        {step === 'deliverables' && (
          <div className="grid max-w-2xl gap-4">
            <DeliverablePlanEditor value={form.deliverable_plan} onChange={v => set('deliverable_plan', v)} />
            <Labelled label="Usage rights">
              <Textarea rows={2} value={form.usage_rights} onChange={e => set('usage_rights', e.target.value)} placeholder="6 months paid usage across Meta and TikTok" />
            </Labelled>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox label="Whitelisting required" checked={form.whitelisting} onChange={e => set('whitelisting', e.target.checked)} />
                Whitelisting / creator-handle ads required
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox label="Approval required before publishing" checked={form.approval_required} onChange={e => set('approval_required', e.target.checked)} />
                Content must be approved before it goes live
              </label>
            </div>
          </div>
        )}

        {step === 'messaging' && (
          <div className="grid max-w-2xl gap-3">
            <Labelled label="Key talking points" hint="One per line — available as a template variable">
              <Textarea rows={4} value={form.talking_points} onChange={e => set('talking_points', e.target.value)} />
            </Labelled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Call to action"><Input value={form.cta} onChange={e => set('cta', e.target.value)} placeholder="Try it free for 14 days" /></Labelled>
              <Labelled label="Discount code"><Input value={form.discount_code} onChange={e => set('discount_code', e.target.value)} /></Labelled>
            </div>
            <Labelled label="Tracking URL"><Input inputMode="url" value={form.tracking_url} onChange={e => set('tracking_url', e.target.value)} /></Labelled>
            <Labelled label="Hashtags" hint="One per line">
              <Textarea rows={2} value={form.hashtags} onChange={e => set('hashtags', e.target.value)} />
            </Labelled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labelled label="Required disclosure"><Input value={form.disclosure_required} onChange={e => set('disclosure_required', e.target.value)} /></Labelled>
              <Labelled label="Prohibited language"><Input value={form.prohibited_language} onChange={e => set('prohibited_language', e.target.value)} /></Labelled>
            </div>
          </div>
        )}

        {errors.length > 0 && step === STEPS[STEPS.length - 1].key && (
          <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
            <p className="text-[13px] font-medium text-destructive">Finish these before creating the campaign:</p>
            <ul className="mt-1 list-inside list-disc text-[13px] text-muted-foreground">
              {errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1].key)}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {errors.length > 0 && <Badge tone="warning">{errors.length} required field{errors.length === 1 ? '' : 's'} left</Badge>}
            {stepIndex < STEPS.length - 1 ? (
              <>
                <Button variant="ghost" onClick={submit} disabled={!canSubmit || create.isPending}>
                  Create now
                </Button>
                <Button onClick={() => setStep(STEPS[stepIndex + 1].key)}>
                  Next <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </>
            ) : (
              <Button onClick={submit} disabled={!canSubmit || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create campaign'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function validate(f: Form): string[] {
  const out: string[] = []
  if (!f.name.trim()) out.push('Campaign name (step 1)')
  if (!f.product_id) out.push('Product (step 1)')
  if (f.brief_min_followers && f.brief_max_followers && Number(f.brief_min_followers) > Number(f.brief_max_followers)) {
    out.push('Minimum followers is above the maximum (step 3)')
  }
  return out
}

function DeliverablePlanEditor({ value, onChange }: {
  value: DeliverablePlanItem[]; onChange: (v: DeliverablePlanItem[]) => void
}) {
  const add = () => onChange([...value, { kind: 'reel', quantity: 1, platform: 'instagram', due_offset_days: 14 }])
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">What each creator produces</span>
        <Button type="button" variant="outline" size="xs" onClick={add}>Add a deliverable</Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
          No deliverables planned yet. You can add them later, or per creator on the campaign board.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_5rem_1fr_7rem_auto]">
              <Select aria-label="Deliverable type" value={item.kind} onChange={e => onChange(value.map((v, j) => j === i ? { ...v, kind: e.target.value } : v))}>
                {DELIVERABLE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
              <Input aria-label="Quantity" inputMode="numeric" value={String(item.quantity)}
                onChange={e => onChange(value.map((v, j) => j === i ? { ...v, quantity: Number(e.target.value) || 1 } : v))} />
              <Select aria-label="Platform" value={item.platform ?? 'instagram'} onChange={e => onChange(value.map((v, j) => j === i ? { ...v, platform: e.target.value } : v))}>
                {['instagram', 'youtube', 'tiktok', 'other'].map(p => <option key={p} value={p}>{platformLabel(p)}</option>)}
              </Select>
              <Input aria-label="Due in days" inputMode="numeric" placeholder="Days" value={item.due_offset_days == null ? '' : String(item.due_offset_days)}
                onChange={e => onChange(value.map((v, j) => j === i ? { ...v, due_offset_days: e.target.value === '' ? null : Number(e.target.value) } : v))} />
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs text-muted-foreground">
        &quot;Due in days&quot; is counted from the day the plan is applied to a creator. Leave it blank to use the campaign end date.
      </p>
    </div>
  )
}
