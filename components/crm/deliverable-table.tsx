'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, ExternalLink, Trash2, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { Table, TableScroll, THead, TH, TR, TD } from '@/components/ui/table'
import { useCreateDeliverable, useUpdateDeliverable, useDeleteDeliverable, type DeliverableWithContext } from '@/lib/queries'
import {
  APPROVAL_STATES, approvalLabel, DELIVERABLE_KINDS, deliverableKindLabel, dueLabel,
} from '@/lib/domain'
import { formatNum, safeUrl, platformLabel } from '@/lib/utils'
import type { CampaignCreator } from '@/types/campaign'
import { DemoBadge } from '@/components/crm/demo'

export function DeliverableTable({ rows, creators, showCampaign = true }: {
  rows: DeliverableWithContext[]
  creators?: CampaignCreator[]
  showCampaign?: boolean
}) {
  const update = useUpdateDeliverable()
  const del = useDeleteDeliverable()
  const [editing, setEditing] = useState<DeliverableWithContext | null>(null)
  const [creating, setCreating] = useState(false)

  const canCreate = !!creators?.length

  if (!rows.length) {
    return (
      <>
        <EmptyState
          icon={PackageCheck}
          title="No deliverables here"
          description={canCreate
            ? 'Add what each creator is expected to produce — a reel, a post, a video — with a due date, so approvals and overdue work surface on Today.'
            : 'Deliverables are attached to a creator inside a campaign. Shortlist creators for a campaign first.'}
          actions={canCreate
            ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" aria-hidden />Add a deliverable</Button>
            : <Button asChild size="sm" variant="outline"><Link href="/campaigns">Open campaigns</Link></Button>}
        />
        {creating && creators && <DeliverableModal creators={creators} onClose={() => setCreating(false)} />}
      </>
    )
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" aria-hidden />Add a deliverable</Button>
        </div>
      )}
      <div className="surface overflow-hidden">
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <TH>Deliverable</TH>
                <TH>Creator</TH>
                {showCampaign && <TH>Campaign</TH>}
                <TH>Due</TH>
                <TH>State</TH>
                <TH>Links</TH>
                <TH align="right">Views</TH>
                <TH align="right">Likes</TH>
                <TH className="w-24"><span className="sr-only">Actions</span></TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(d => {
                const due = dueLabel(d.due_date)
                const submitted = safeUrl(d.submitted_url)
                const published = safeUrl(d.published_url)
                return (
                  <TR key={d.id}>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                        {d.title || deliverableKindLabel(d.kind)}
                        <DemoBadge on={d.demo_run_id} />
                      </span>
                      <span className="block text-2xs text-muted-foreground">{platformLabel(d.platform)} · {deliverableKindLabel(d.kind)}</span>
                    </TD>
                    <TD className="text-[13px]">@{d.handle}</TD>
                    {showCampaign && (
                      <TD className="text-2xs">
                        <Link href={`/campaigns/${d.campaign_id}`} className="text-primary hover:underline">{d.campaign_name}</Link>
                        {d.product_name && <span className="block text-muted-foreground">{d.product_name}</span>}
                      </TD>
                    )}
                    <TD>{due ? <Badge tone={due.tone}>{due.text}</Badge> : <span className="text-2xs text-muted-foreground">No due date</span>}</TD>
                    <TD>
                      <Select
                        aria-label={`Approval state for ${d.title || d.kind}`}
                        className="h-8 text-2xs" containerClassName="w-40"
                        value={d.approval_state}
                        onChange={e => update.mutate({ id: d.id, patch: { approval_state: e.target.value } },
                          { onSuccess: () => toast.success(`Marked ${approvalLabel(e.target.value).toLowerCase()}.`), onError: err => toast.error(err.message) })}
                      >
                        {APPROVAL_STATES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </Select>
                    </TD>
                    <TD>
                      <span className="flex flex-col gap-0.5 text-2xs">
                        {submitted && <a href={submitted} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Draft<ExternalLink className="h-3 w-3" aria-hidden /></a>}
                        {published && <a href={published} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Published<ExternalLink className="h-3 w-3" aria-hidden /></a>}
                        {!submitted && !published && <span className="text-muted-foreground">None yet</span>}
                      </span>
                    </TD>
                    <TD align="right" className="tnum text-2xs">
                      {d.views == null ? <span className="text-muted-foreground">—</span> : formatNum(d.views)}
                    </TD>
                    <TD align="right" className="tnum text-2xs">
                      {d.likes == null ? <span className="text-muted-foreground">—</span> : formatNum(d.likes)}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="xs" onClick={() => setEditing(d)}>Edit</Button>
                        <Button
                          variant="ghost" size="xs"
                          onClick={() => {
                            if (!confirm('Delete this deliverable?')) return
                            del.mutate(d.id, { onSuccess: () => toast.success('Deleted.'), onError: e => toast.error(e.message) })
                          }}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden /><span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        </TableScroll>
      </div>

      {editing && <DeliverableModal existing={editing} creators={creators ?? []} onClose={() => setEditing(null)} />}
      {creating && creators && <DeliverableModal creators={creators} onClose={() => setCreating(false)} />}
    </div>
  )
}

function DeliverableModal({ existing, creators, onClose }: {
  existing?: DeliverableWithContext
  creators: CampaignCreator[]
  onClose: () => void
}) {
  const create = useCreateDeliverable()
  const update = useUpdateDeliverable()
  const [form, setForm] = useState({
    campaign_creator_id: existing?.campaign_creator_id ?? creators[0]?.id ?? '',
    platform: existing?.platform ?? 'instagram',
    kind: existing?.kind ?? 'reel',
    title: existing?.title ?? '',
    brief: existing?.brief ?? '',
    due_date: existing?.due_date ?? '',
    submitted_url: existing?.submitted_url ?? '',
    approval_state: existing?.approval_state ?? 'planned',
    feedback: existing?.feedback ?? '',
    published_url: existing?.published_url ?? '',
    published_at: existing?.published_at ?? '',
    views: existing?.views != null ? String(existing.views) : '',
    likes: existing?.likes != null ? String(existing.likes) : '',
    comments_count: existing?.comments_count != null ? String(existing.comments_count) : '',
    saves: existing?.saves != null ? String(existing.saves) : '',
    clicks: existing?.clicks != null ? String(existing.clicks) : '',
    conversions: existing?.conversions != null ? String(existing.conversions) : '',
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    try {
      if (existing) await update.mutateAsync({ id: existing.id, patch: form })
      else await create.mutateAsync(form)
      toast.success(existing ? 'Deliverable updated.' : 'Deliverable added.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      size="lg"
      title={existing ? 'Edit deliverable' : 'Add a deliverable'}
      description="Performance numbers are entered by hand. Leave a field blank when the number is unknown — blank reads as 'not recorded', not as zero."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!form.campaign_creator_id || create.isPending || update.isPending}>Save</Button>
        </>
      }
    >
      <div className="grid gap-3">
        {!existing && (
          <Labelled label="Creator" required>
            <Select value={form.campaign_creator_id} onChange={e => set('campaign_creator_id', e.target.value)}>
              {creators.map(c => <option key={c.id} value={c.id}>@{c.handle}{c.full_name ? ` — ${c.full_name}` : ''}</option>)}
            </Select>
          </Labelled>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Labelled label="Type">
            <Select value={form.kind} onChange={e => set('kind', e.target.value)}>
              {DELIVERABLE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Labelled>
          <Labelled label="Platform">
            <Select value={form.platform} onChange={e => set('platform', e.target.value)}>
              {['instagram', 'youtube', 'tiktok', 'other'].map(p => <option key={p} value={p}>{platformLabel(p)}</option>)}
            </Select>
          </Labelled>
          <Labelled label="Due date"><Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></Labelled>
        </div>
        <Labelled label="Title"><Input value={form.title} onChange={e => set('title', e.target.value)} /></Labelled>
        <Labelled label="Brief"><Textarea rows={2} value={form.brief} onChange={e => set('brief', e.target.value)} /></Labelled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Approval state">
            <Select value={form.approval_state} onChange={e => set('approval_state', e.target.value)}>
              {APPROVAL_STATES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Labelled>
          <Labelled label="Submitted draft URL"><Input inputMode="url" value={form.submitted_url} onChange={e => set('submitted_url', e.target.value)} /></Labelled>
        </div>
        <Labelled label="Feedback"><Textarea rows={2} value={form.feedback} onChange={e => set('feedback', e.target.value)} /></Labelled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Published URL"><Input inputMode="url" value={form.published_url} onChange={e => set('published_url', e.target.value)} /></Labelled>
          <Labelled label="Published date"><Input type="date" value={form.published_at} onChange={e => set('published_at', e.target.value)} /></Labelled>
        </div>
        <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
          <legend className="px-1 text-2xs uppercase tracking-wide text-muted-foreground">Performance (manual entry)</legend>
          {([['views', 'Views'], ['likes', 'Likes'], ['comments_count', 'Comments'], ['saves', 'Saves'], ['clicks', 'Clicks'], ['conversions', 'Conversions']] as const).map(([k, label]) => (
            <Labelled key={k} label={label}>
              <Input inputMode="numeric" value={form[k]} onChange={e => set(k, e.target.value)} placeholder="Not recorded" />
            </Labelled>
          ))}
        </fieldset>
      </div>
    </Modal>
  )
}

export { DeliverableModal }
