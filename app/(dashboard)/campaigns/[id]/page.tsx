'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCampaign, useUpdateCampaign, useDeleteCampaign } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { StageBadge, SignedBadge } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { DealDrawer } from '@/components/crm/deal-drawer'
import { ChevronLeft, Users, Handshake, Trash2, Film } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignStatus } from '@/types/database'

const STATUS: CampaignStatus[] = ['planning', 'active', 'completed', 'archived']

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: c, isLoading } = useCampaign(id)
  const isAdmin = useIsAdmin()
  const update = useUpdateCampaign()
  const del = useDeleteCampaign()
  const router = useRouter()
  const [openHandle, setOpenHandle] = useState<string | null>(null)
  const [openDeal, setOpenDeal] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [brief, setBrief] = useState('')
  useEffect(() => { if (c) { setName(c.name); setClient(c.client ?? ''); setBrief(c.brief ?? '') } }, [c?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !c) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
  }

  const save = (patch: Record<string, unknown>, msg = 'Saved') => update.mutate({ id, patch }, { onSuccess: () => toast.success(msg) })

  return (
    <div className="space-y-6">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Campaigns</Link>

      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isAdmin ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== c.name) save({ name }) }}
                className="border-0 bg-transparent px-0 text-2xl font-bold focus:bg-card/40 focus:px-2" />
            ) : (
              <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Select value={c.status} onChange={(e) => save({ status: e.target.value }, 'Status updated')} className="w-36">
                {STATUS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </Select>
            ) : (
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">{c.status}</span>
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                onClick={() => { if (confirm('Delete this campaign? Tagged creators and deals are kept (just untagged).')) del.mutate(id, { onSuccess: () => { toast.success('Campaign deleted'); router.push('/campaigns') } }) }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Client / brand</label>
            {isAdmin ? (
              <Input value={client} onChange={(e) => setClient(e.target.value)} onBlur={() => { if (client !== (c.client ?? '')) save({ client }) }} placeholder="Client name" />
            ) : <p className="text-sm">{c.client || '—'}</p>}
          </div>
          <div className="flex items-end gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.pipeline_count} creators</span>
            <span className="inline-flex items-center gap-1"><Handshake className="h-3.5 w-3.5" /> {c.deal_count} deals</span>
            <span>{c.signed_count} signed</span>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">Brief</label>
          {isAdmin ? (
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} onBlur={() => { if (brief !== (c.brief ?? '')) save({ brief }) }} rows={2}
              placeholder="Goals, deliverables, target creators…" className="w-full rounded-lg border border-border bg-card/40 p-2.5 text-sm outline-none focus:border-primary/50" />
          ) : <p className="text-sm text-muted-foreground">{c.brief || '—'}</p>}
        </div>
      </div>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" /> Creators in pipeline</h2>
        {c.pipeline.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No creators tagged to this campaign yet. Tag them from a creator’s drawer or in bulk on the Pipeline page.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {c.pipeline.map(r => (
              <button key={r.id} onClick={() => setOpenHandle(r.handle)} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40">
                <Avatar name={r.full_name || r.handle} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.full_name || r.handle}</p>
                  <p className="truncate text-xs text-muted-foreground">@{r.handle}{r.assigned_name ? ` · ${r.assigned_name}` : ''}</p>
                </div>
                <StageBadge stage={r.stage} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Handshake className="h-4 w-4" /> Deals</h2>
        {c.deals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No deals tagged to this campaign yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {c.deals.map(d => (
              <button key={d.id} onClick={() => setOpenDeal(d.id)} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40">
                <Avatar name={d.influencer_name || d.handle} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">@{d.handle} · <Film className="inline h-3 w-3" /> {d.videos_planned} planned</p>
                </div>
                <SignedBadge signedAt={d.signed_at} />
              </button>
            ))}
          </div>
        )}
      </section>

      <InfluencerDrawer influencerId={openHandle} onOpenChange={(o) => !o && setOpenHandle(null)} />
      <DealDrawer dealId={openDeal} onOpenChange={(o) => !o && setOpenDeal(null)} />
    </div>
  )
}
