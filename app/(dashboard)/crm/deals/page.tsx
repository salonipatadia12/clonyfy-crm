'use client'

import { useMemo, useState } from 'react'
import { Handshake, TrendingUp, Clock, Trophy, Search, Plus, Film, ArrowUp, ArrowDown } from 'lucide-react'
import { useDeals, useStats } from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { NewDealModal } from '@/components/crm/new-deal-modal'
import { DealDrawer } from '@/components/crm/deal-drawer'
import { formatMoney, cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { Collaboration } from '@/types/database'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

export default function DealsPage() {
  const { data, isLoading } = useDeals()
  const { data: stats } = useStats()
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'deal_value' | 'created_at' | 'status'>('deal_value')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [newOpen, setNewOpen] = useState(false)
  const [openDeal, setOpenDeal] = useState<Collaboration | null>(null)

  const deals = useMemo(() => {
    let rows = (data?.deals ?? []) as Collaboration[]
    if (filter) rows = rows.filter(d => d.status === filter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(d => d.title.toLowerCase().includes(q) || (d.influencer_name ?? '').toLowerCase().includes(q) || (d.influencer_handle ?? '').toLowerCase().includes(q))
    }
    const dir = order === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort === 'deal_value') return ((a.deal_value ?? 0) - (b.deal_value ?? 0)) * dir
      if (sort === 'status') return a.status.localeCompare(b.status) * dir
      return (a.created_at < b.created_at ? -1 : 1) * dir
    })
  }, [data, filter, search, sort, order])

  const d = stats?.deals

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every collaboration you&apos;ve logged with a creator.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> New deal</Button>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d ? (
          <>
            <KpiCard id="rev" index={0} label="Revenue Won" value={d.revenue_won} format={(n) => formatMoney(n)} sub="completed deals" icon={Trophy} accent="emerald" />
            <KpiCard id="pipe" index={1} label="In Pipeline" value={d.pipeline_value} format={(n) => formatMoney(n)} sub="active deal value" icon={Clock} accent="amber" />
            <KpiCard id="total" index={2} label="Total Logged" value={d.total_value} format={(n) => formatMoney(n)} sub="all statuses" icon={TrendingUp} accent="violet" />
            <KpiCard id="videos" index={3} label="Videos Generated" value={d.videos} sub="deals with a reel" icon={Film} accent="cyan" />
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
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-36">
            <option value="deal_value">Value</option>
            <option value="created_at">Created</option>
            <option value="status">Status</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')} className="border border-border">
            {order === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Handshake className="mb-3 h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm font-medium">No deals yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Click <span className="text-foreground">+ New deal</span> or open a creator and add one to start tracking revenue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-3 py-3">Deal</th>
                  <th className="px-3 py-3 text-right">Value</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.id} onClick={() => setOpenDeal(deal)} className="cursor-pointer border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={deal.influencer_name || deal.influencer_handle || '?'} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{deal.influencer_name}</p>
                          <p className="text-xs text-muted-foreground">@{deal.influencer_handle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {deal.reel_url && <Film className="h-3.5 w-3.5 text-cyan-400" aria-label="has reel" />}
                        {deal.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{formatMoney(deal.deal_value, deal.currency)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[deal.status])}>{deal.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewDealModal open={newOpen} onOpenChange={setNewOpen} />
      <DealDrawer deal={openDeal} onOpenChange={(o) => !o && setOpenDeal(null)} />
    </div>
  )
}
