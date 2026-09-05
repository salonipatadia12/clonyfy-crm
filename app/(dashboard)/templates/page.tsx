'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Plus, Trash2, AlertTriangle, Copy, Check } from 'lucide-react'
import { useTemplateList, useSaveTemplate, useDeleteTemplate2, useCampaignList, useProducts } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { renderTemplate, VARIABLES } from '@/lib/template-vars'
import { channelLabel } from '@/lib/domain'
import type { TemplateRow, FollowUpStep, Campaign } from '@/types/campaign'

export default function TemplatesPage() {
  const { data, isLoading, error, refetch } = useTemplateList()
  const [editing, setEditing] = useState<TemplateRow | 'new' | null>(null)
  const del = useDeleteTemplate2()

  if (isLoading) return <div className="space-y-4"><Shimmer className="h-8 w-40" /><Shimmer className="h-64 rounded-xl" /></div>
  if (error) return <div className="space-y-4"><PageHeader title="Templates" /><ErrorState error={error} onRetry={() => refetch()} /></div>

  const rows = data ?? []
  return (
    <div className="space-y-4">
      <PageHeader
        title="Outreach templates"
        description="Channel-aware messages with a follow-up ladder. Variables resolve from a real campaign and creator, and the preview warns you before you copy something with a blank in it."
        actions={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-3.5 w-3.5" aria-hidden />New template</Button>}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Write your first outreach message. Bind it to a campaign so {{product}} and {{client}} resolve, and add follow-up steps so nobody is chased twice in one day."
          actions={<Button size="sm" onClick={() => setEditing('new')}>Create a template</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map(t => (
            <li key={t.id} className="surface flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{t.name}</p>
                  <p className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge tone="info">{channelLabel(t.channel)}</Badge>
                    {t.campaign_name && <Badge tone="outline">{t.campaign_name}</Badge>}
                    {t.follow_ups.length > 0 && <Badge tone="neutral">{t.follow_ups.length} follow-up{t.follow_ups.length === 1 ? '' : 's'}</Badge>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="xs" onClick={() => setEditing(t)}>Edit</Button>
                  <Button
                    variant="ghost" size="xs"
                    onClick={() => {
                      if (!confirm(`Delete "${t.name}"?`)) return
                      del.mutate(t.id, { onSuccess: () => toast.success('Template deleted.'), onError: e => toast.error(e.message) })
                    }}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden /><span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
              {t.subject && <p className="text-2xs font-medium text-muted-foreground">Subject: {t.subject}</p>}
              <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{t.body}</p>
            </li>
          ))}
        </ul>
      )}

      {editing && <TemplateModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TemplateModal({ value, onClose }: { value: TemplateRow | null; onClose: () => void }) {
  const save = useSaveTemplate()
  const { data: campaigns } = useCampaignList()
  const { data: products } = useProducts()
  const [form, setForm] = useState({
    name: value?.name ?? '',
    channel: value?.channel ?? 'instagram_dm',
    campaign_id: value?.campaign_id ?? '',
    product_id: value?.product_id ?? '',
    subject: value?.subject ?? '',
    body: value?.body ?? '',
    tags: (value?.tags ?? []).join(', '),
  })
  const [followUps, setFollowUps] = useState<FollowUpStep[]>(value?.follow_ups ?? [])
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  // Preview resolves against a real campaign, and against a representative
  // creator shape so blanks show up before the message is copied.
  const campaign = (campaigns ?? []).find(c => c.id === form.campaign_id)
  const previewCtx = useMemo(() => ({
    campaign: (campaign ?? {
      name: 'Your campaign', client_name: null, product_name: null, cta: null, discount_code: null,
      tracking_url: null, offer_type: null, offer_flat_fee: null, offer_gifted_product: null,
      offer_currency: 'USD', talking_points: null,
    }) as Campaign,
    creator: { handle: 'sample_creator', full_name: 'Sample Creator', follower_count: 12400, niche: 'web_dev' },
    senderName: 'You',
  }), [campaign])

  const rendered = renderTemplate(form.body, previewCtx)
  const renderedSubject = renderTemplate(form.subject, previewCtx)
  const missing = [...new Set([...rendered.missing, ...renderedSubject.missing])]

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: value?.id,
        name: form.name,
        channel: form.channel,
        campaign_id: form.campaign_id || null,
        product_id: form.product_id || null,
        subject: form.channel === 'email' ? form.subject : null,
        body: form.body,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        follow_ups: followUps,
      })
      toast.success(value ? 'Template updated.' : 'Template created.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      size="xl"
      title={value ? `Edit "${value.name}"` : 'New outreach template'}
      description="Clonify prepares and logs messages. It does not send them, so nothing here schedules a delivery — the delay on a follow-up step is guidance for whoever works the queue."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || !form.body.trim() || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save template'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <Labelled label="Template name" required>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dev creators — first DM" />
          </Labelled>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labelled label="Channel">
              <Select value={form.channel} onChange={e => set('channel', e.target.value as 'instagram_dm' | 'email')}>
                <option value="instagram_dm">Instagram DM</option>
                <option value="email">Email</option>
              </Select>
            </Labelled>
            <Labelled label="Campaign" hint="Binds {{client}} and {{product}}">
              <Select value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)}>
                <option value="">Any campaign</option>
                {(campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Labelled>
          </div>
          <Labelled label="Product" hint="Optional — for templates reused across campaigns for one product">
            <Select value={form.product_id} onChange={e => set('product_id', e.target.value)}>
              <option value="">Not bound to a product</option>
              {(products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Labelled>
          {form.channel === 'email' && (
            <Labelled label="Subject"><Input value={form.subject} onChange={e => set('subject', e.target.value)} /></Labelled>
          )}
          <Labelled label="First message" required>
            <Textarea rows={8} value={form.body} onChange={e => set('body', e.target.value)} />
          </Labelled>
          <div className="flex flex-wrap gap-1">
            {VARIABLES.map(v => (
              <button
                key={v.key}
                type="button"
                title={v.description}
                onClick={() => set('body', `${form.body}{{${v.key}}}`)}
                className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
          <FollowUpEditor steps={followUps} onChange={setFollowUps} />
          <Labelled label="Tags" hint="Comma separated"><Input value={form.tags} onChange={e => set('tags', e.target.value)} /></Labelled>
        </div>

        <div className="space-y-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview {campaign ? `for ${campaign.name}` : '(no campaign selected)'}
          </p>
          {missing.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-2xs text-warning">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                No value for <span className="font-mono">{missing.join(', ')}</span>
                {campaign ? ' on this campaign.' : '. Select a campaign to resolve client and product.'}
                {' '}These render as blanks.
              </span>
            </p>
          )}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px] leading-relaxed">
            {form.channel === 'email' && renderedSubject.text && <p className="mb-2 font-medium">{renderedSubject.text}</p>}
            <p className="whitespace-pre-wrap">{rendered.text || <span className="text-muted-foreground">Your message appears here.</span>}</p>
          </div>
          {followUps.map((f, i) => (
            <div key={i} className="rounded-lg border border-dashed border-border p-3">
              <p className="mb-1 text-2xs font-medium text-muted-foreground">Follow-up {i + 1} · suggested {f.delay_days} day{f.delay_days === 1 ? '' : 's'} later</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{renderTemplate(f.body, previewCtx).text}</p>
            </div>
          ))}
          <CopyPreview text={rendered.text} />
          <p className="text-2xs text-muted-foreground">
            The preview uses a sample creator. In the campaign composer it resolves against the real one.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function CopyPreview({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="outline" size="sm" disabled={!text.trim()}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
        catch { toast.error('Your browser blocked clipboard access.') }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? 'Copied' : 'Copy preview'}
    </Button>
  )
}

function FollowUpEditor({ steps, onChange }: { steps: FollowUpStep[]; onChange: (s: FollowUpStep[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">Follow-up sequence</span>
        <Button
          type="button" variant="outline" size="xs"
          onClick={() => onChange([...steps, { step: steps.length + 1, delay_days: 4, body: '' }])}
        >
          Add a step
        </Button>
      </div>
      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-2.5 text-2xs text-muted-foreground">
          No follow-ups. Add one or two so a non-reply has a planned next move.
        </p>
      ) : (
        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <Labelled label={`Step ${i + 1} — send after`} hint="days" className="w-32">
                  <Input
                    inputMode="numeric" value={String(s.delay_days)}
                    onChange={e => onChange(steps.map((x, j) => j === i ? { ...x, delay_days: Number(e.target.value) || 1 } : x))}
                  />
                </Labelled>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(steps.filter((_, j) => j !== i))}>Remove</Button>
              </div>
              <Textarea
                rows={3} placeholder="Follow-up message" value={s.body}
                onChange={e => onChange(steps.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
