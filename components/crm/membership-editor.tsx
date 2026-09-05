'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Labelled } from '@/components/ui/field'
import { useUpdateCampaignCreator } from '@/lib/queries'
import { CC_STAGES, CC_STAGE_LABELS } from '@/lib/domain'
import type { CampaignCreator } from '@/types/campaign'

/**
 * The five things stored about an influencer inside one campaign.
 *
 * That is the whole record: status, how you reached them, when you last did,
 * when to chase, and anything you want to remember. Deliberately not a form
 * with a brief, an offer, usage rights and a deliverable plan.
 */
const CHANNELS = [
  { value: '', label: 'Not contacted yet' },
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
]

export function MembershipEditor({ row, open, onOpenChange }: {
  row: CampaignCreator | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const update = useUpdateCampaignCreator()
  const [form, setForm] = useState<Record<string, string>>({})
  const [seeded, setSeeded] = useState<string | null>(null)

  // Seed from the row the first time it is shown, without an effect.
  if (row && seeded !== row.id) {
    setSeeded(row.id)
    setForm({
      stage: row.stage,
      outreach_channel: row.outreach_channel ?? '',
      last_contacted_on: row.last_contacted_on ?? '',
      next_follow_up: row.next_follow_up ?? '',
      notes: row.notes ?? '',
    })
  }
  if (!row) return null

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    update.mutate({
      id: row.id,
      patch: {
        stage: form.stage,
        outreach_channel: form.outreach_channel || null,
        last_contacted_on: form.last_contacted_on || null,
        next_follow_up: form.next_follow_up || null,
        notes: form.notes || null,
      },
    }, {
      onSuccess: () => { toast.success('Saved.'); onOpenChange(false) },
      onError: e => toast.error(e.message),
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={row.full_name || '@' + row.handle}
      description={`In ${row.campaign_name ?? 'this campaign'}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Labelled label="Status">
          <Select value={form.stage} onChange={e => set('stage', e.target.value)}>
            {CC_STAGES.map(s => <option key={s} value={s}>{CC_STAGE_LABELS[s]}</option>)}
          </Select>
        </Labelled>

        <Labelled label="How you contacted them">
          <Select value={form.outreach_channel} onChange={e => set('outreach_channel', e.target.value)}>
            {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Labelled>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled label="Last contacted">
            <Input type="date" value={form.last_contacted_on} onChange={e => set('last_contacted_on', e.target.value)} />
          </Labelled>
          <Labelled label="Follow up on" hint="Shows on the dashboard when due">
            <Input type="date" value={form.next_follow_up} onChange={e => set('next_follow_up', e.target.value)} />
          </Labelled>
        </div>

        <Labelled label="Notes">
          <Textarea rows={4} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="What they said, what they asked for, anything to remember." />
        </Labelled>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          Saving records what you did. Clonify does not send messages — nothing here is transmitted anywhere.
        </p>
      </div>
    </Modal>
  )
}
