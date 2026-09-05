'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Labelled } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { useClients, useProducts, useCreateCampaignV2, useCreatorFacets } from '@/lib/queries'
import { nicheLabel } from '@/lib/utils'

/**
 * One screen, seven fields.
 *
 * This was a six-step wizard collecting objectives, follower ranges, geography
 * rules, offer terms, deliverable plans, tracking links and disclosure text —
 * thirty-odd inputs before you could save. Everything a campaign actually needs
 * to exist is here; the rest is editable on the campaign afterwards.
 */
export default function NewCampaignPage() {
  const router = useRouter()
  const { data: clients } = useClients()
  const { data: products } = useProducts()
  const { data: facets } = useCreatorFacets()
  const create = useCreateCampaignV2()

  const [form, setForm] = useState({
    name: '', client_id: '', product_id: '', niche: '',
    start_date: '', end_date: '', notes: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const clientProducts = (products ?? []).filter(p => !form.client_id || p.client_id === form.client_id)
  const canSave = form.name.trim().length > 0 && !!form.client_id

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    create.mutate({
      name: form.name.trim(),
      client_id: form.client_id,
      product_id: form.product_id || null,
      brief_niches: form.niche ? [form.niche] : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      brief_notes: form.notes || null,
      status: 'active',
    }, {
      onSuccess: c => { toast.success('Campaign created.'); router.push(`/campaigns/${c.id}`) },
      onError: err => toast.error(err.message),
    })
  }

  if (clients && clients.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="New campaign" />
        <EmptyState
          title="Add a client first"
          description="A campaign runs for a client, so you need at least one before you can create a campaign."
          actions={<Button asChild size="sm"><Link href="/clients">Add a client</Link></Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="New campaign" description="Only the name and client are required. Everything else can be changed later." />

      <form onSubmit={submit} className="surface space-y-4 p-5">
        <Labelled label="Campaign name" required>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Spring launch" autoFocus />
        </Labelled>

        <Labelled label="Client" required>
          <Select value={form.client_id} onChange={e => { set('client_id', e.target.value); set('product_id', '') }}>
            <option value="">Choose a client…</option>
            {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Labelled>

        <Labelled label="Product" hint={form.client_id ? undefined : 'Choose a client first'}>
          <Select value={form.product_id} onChange={e => set('product_id', e.target.value)} disabled={!form.client_id}>
            <option value="">No product</option>
            {clientProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Labelled>

        <Labelled label="Niche" hint="Used to suggest influencers for this campaign">
          <Select value={form.niche} onChange={e => set('niche', e.target.value)}>
            <option value="">Any niche</option>
            {(facets?.niche ?? []).map(n => (
              <option key={n.value} value={n.value}>{nicheLabel(n.value)}</option>
            ))}
          </Select>
        </Labelled>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled label="Start date">
            <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </Labelled>
          <Labelled label="End date">
            <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </Labelled>
        </div>

        <Labelled label="Notes">
          <Textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Anything the team should know about this campaign." />
        </Labelled>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="submit" disabled={!canSave || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create campaign'}
          </Button>
          <Button asChild type="button" variant="outline"><Link href="/campaigns">Cancel</Link></Button>
          {!canSave && (
            <span className="self-center text-2xs text-muted-foreground">
              A name and a client are needed to save.
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
