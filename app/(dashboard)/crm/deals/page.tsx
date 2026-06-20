'use client'

import { useMemo, useState } from 'react'
import { Handshake, Film, TrendingUp, Clock, Search, Plus, ArrowUp, ArrowDown, Check, Trash2 } from 'lucide-react'
import { useDeals, useUpdateDeal, useDeleteDeal } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { SignedBadge } from '@/components/crm/badges'
import { NewDealModal } from '@/components/crm/new-deal-modal'
import { DealDrawer } from '@/components/crm/deal-drawer'
import { formatNum, cn, downloadCsv } from '@/lib/utils'
import { Download } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Deal } from '@/types/database'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

export default function DealsPage() {
  const { data, isLoading } = useDeals()
  const me = useAuth()
  const isAdmin = useIsAdmin()
  const [filter, setFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')   // '', 'mine', or a creator id
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'created_at' | 'total_views' | 'status'>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [newOpen, setNewOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const updateDeal = useUpdateDeal()
  const deleteDeal = useDeleteDeal()

  const creators = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of data?.deals ?? []) if (d.created_by && d.created_by_name) seen.set(d.created_by, d.created_by_name)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [data])

  const deals = useMemo(() => {
    let rows = (data?.deals ?? []) as Deal[]
    if (filter) rows = rows.filter(d => d.status === filter)
    if (ownerFilter === 'mine') rows = rows.filter(d => d.created_by === me.id)
    else if (ownerFilter) rows = rows.filter(d => d.created_by === ownerFilter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(d => d.title.toLowerCase().includes(q) || (d.influencer_name ?? '').toLowerCase().includes(q) || d.handle.toLowerCase().includes(q))
    }
    const dir = order === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort === 'total_views') return (a.total_views - b.total_views) * dir
      if (sort === 'status') return a.status.localeCompare(b.status) * dir
      return (a.created_at < b.created_at ? -1 : 1) * dir
    })
  }, [data, filter, ownerFilter, me.id, search, sort, order])

  const s = data?.stats

  const allSelected = deals.length > 0 && deals.every(d => selected.has(d.id))
  const toggleAll = () => {
    const next = new Set(selected)
    if (allSelected) deals.forEach(d => next.delete(d.id)); else deals.forEach(d => next.add(d.id))
    setSelected(next)
  }
  const toggleRow = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next) }

  const applyBulkStatus = async () => {
    if (!bulkStatus) return
    const ids = [...selected]
    await Promise.all(ids.map(id => updateDeal.mutateAsync({ id, patch: { status: bulkStatus } }).catch(() => null)))
    toast.success(`Updated ${ids.length} deal${ids.length > 1 ? 's' : ''}`); setSelected(new Set()); setBulkStatus('')
  }
  const applyBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} deal${ids.length > 1 ? 's' : ''}? This can't be undone.`)) return
    await Promise.all(ids.map(id => deleteDeal.mutateAsync(id).catch(() => null)))
    toast.success(`Deleted ${ids.length} deal${ids.length > 1 ? 's' : ''}`); setSelected(new Set())
  }
  const exportSelected = () => {
    const rows = (selected.size ? deals.filter(d => selected.has(d.id)) : deals) as unknown as Record<string, unknown>[]
    downloadCsv('clonyfy-deals.csv', rows, [
      { key: 'handle', label: 'handle' }, { key: 'influencer_name', label: 'creator' },
      { key: 'title', label: 'deal' }, { key: 'status', label: 'status' },
      { key: 'videos_posted', label: 'videos_posted' }, { key: 'videos_planned', label: 'videos_planned' },
      { key: 'total_views', label: 'total_views' }, { key: 'owner_name', label: 'owner' },
      { key: 'created_by_name', label: 'created_by' }, { key: 'signed_at', label: 'signed_at' },
      { key: 'created_at', label: 'created_at' },
    ])
    toast.success(`Exported ${rows.length} deal${rows.length > 1 ? 's' : ''}`)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Creators who agreed to collaborate — tracked by the videos they deliver.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> New deal</Button>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <KpiCard id="total" index={0} label="Total Deals" value={s.total} sub={`${s.active} active`} icon={Handshake} accent="violet" />
            <KpiCard id="active" index={1} label="Active" value={s.active} sub={`${s.completed} completed`} icon={Clock} accent="amber" />
            <KpiCard id="videos" index={2} label="Videos Posted" value={s.videosPosted} sub={`of ${s.videosPlanned} planned`} icon={Film} accent="cyan" />
            <KpiCard id="views" index={3} label="Total Views" value={s.totalViews} format={(n) => formatNum(n)} sub="across all videos" icon={TrendingUp} accent="emerald" />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search creator or deal…" className="pl-9" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-36">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="w-40">
            <option value="">All creators</option>
            <option value="mine">Created by me</option>
            {isAdmin && creators.filter(c => c.id !== me.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-36">
            <option value="created_at">Created</option>
            <option value="total_views">Views</option>
            <option value="status">Status</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')} className="border border-border">
            {order === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-1.5">
              <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="h-9 w-40">
                <option value="">Set status…</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
              <Button size="sm" onClick={applyBulkStatus} disabled={!bulkStatus || updateDeal.isPending}>Apply</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={exportSelected} className="border border-border"><Download className="mr-1 h-4 w-4" /> Export</Button>
            <Button size="sm" variant="ghost" onClick={applyBulkDelete} disabled={deleteDeal.isPending} className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Handshake className="mb-3 h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm font-medium">No deals yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Click <span className="text-foreground">+ New deal</span>, or open a creator in your pipeline and start a deal once they agree.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-3"><DealCheckbox checked={allSelected} onChange={toggleAll} /></th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-3 py-3">Deal</th>
                  <th className="px-3 py-3">Created by</th>
                  <th className="px-3 py-3 text-center">Videos</th>
                  <th className="px-3 py-3 text-right">Views</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Signed</th>
                  <th className="px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.id} onClick={() => setOpenId(deal.id)} className={cn('cursor-pointer border-b border-border/40 hover:bg-muted/30', selected.has(deal.id) && 'bg-primary/5')}>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}><DealCheckbox checked={selected.has(deal.id)} onChange={() => toggleRow(deal.id)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={deal.influencer_name || deal.handle} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{deal.influencer_name || deal.handle}</p>
                          <p className="text-xs text-muted-foreground">@{deal.handle}{deal.owner_name ? ` · ${deal.owner_name}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{deal.title}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{deal.created_by === me.id ? 'You' : (deal.created_by_name || '—')}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      <span className="inline-flex items-center gap-1"><Film className="h-3.5 w-3.5 text-cyan-400" /> {deal.videos_posted}/{deal.videos_planned}</span>
                      {!!deal.overdue && <span className="ml-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">{deal.overdue} overdue</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatNum(deal.total_views)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[deal.status])}>{deal.status}</span>
                    </td>
                    <td className="px-3 py-2.5"><SignedBadge signedAt={deal.signed_at} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewDealModal open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => setOpenId(id)} />
      <DealDrawer dealId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function DealCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange() }}
      className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}
