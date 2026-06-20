'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useCampaigns, useCreateCampaign } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { Megaphone, Plus, Users, Handshake, PenLine, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { CampaignStatus } from '@/types/database'

const STATUS_STYLE: Record<CampaignStatus, string> = {
  planning:  'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  active:    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  archived:  'bg-slate-500/10 text-slate-500 border border-slate-500/20',
}

export default function CampaignsPage() {
  const { data, isLoading } = useCampaigns()
  const isAdmin = useIsAdmin()
  const create = useCreateCampaign()
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [brief, setBrief] = useState('')

  const campaigns = useMemo(() => {
    const rows = data?.campaigns ?? []
    return filter ? rows.filter(c => c.status === filter) : rows
  }, [data, filter])

  const submit = () => {
    if (!name.trim()) { toast.error('Campaign name required'); return }
    create.mutate({ name, client, brief }, {
      onSuccess: () => { setOpen(false); setName(''); setClient(''); setBrief(''); toast.success('Campaign created') },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Group the creators you work and the deals you sign under each client engagement.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-36">
            <option value="">All statuses</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
          {isAdmin && <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New campaign</Button>}
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : campaigns.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-2xl py-20 text-center">
          <Megaphone className="mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{isAdmin ? 'Create a campaign, then tag creators and deals to it from their drawers or in bulk.' : 'An admin can set up campaigns to organize the team’s work.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(c => (
            <Link key={c.id} href={`/campaigns/${c.id}`}
              className="glass group rounded-2xl border border-border/60 p-5 transition-colors hover:border-primary/40">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold group-hover:text-primary">{c.name}</p>
                  {c.client && <p className="truncate text-xs text-muted-foreground">{c.client}</p>}
                </div>
                <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[c.status])}>{c.status}</span>
              </div>
              {c.brief && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.brief}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.pipeline_count} creators</span>
                <span className="inline-flex items-center gap-1"><Handshake className="h-3.5 w-3.5" /> {c.deal_count} deals</span>
                <span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> {c.signed_count} signed</span>
                <ArrowUpRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title="New campaign" description="A client/brand engagement to group creators and deals.">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name (e.g. Spring Launch)" />
          <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client / brand (optional)" />
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="Brief — goals, deliverables, target creators…"
            className="w-full rounded-lg border border-border bg-card/40 p-3 text-sm outline-none focus:border-primary/50" />
          <Button onClick={submit} disabled={create.isPending} className="w-full">{create.isPending ? 'Creating…' : 'Create campaign'}</Button>
        </div>
      </Modal>
    </div>
  )
}
