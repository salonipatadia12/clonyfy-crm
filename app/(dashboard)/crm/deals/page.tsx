'use client'

import { useState } from 'react'
import { Handshake, TrendingUp, Clock, Trophy } from 'lucide-react'
import { useDeals, useUpdateDeal, useStats } from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { formatMoney, cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

export default function DealsPage() {
  const { data, isLoading } = useDeals()
  const { data: stats } = useStats()
  const updateDeal = useUpdateDeal()
  const [filter, setFilter] = useState('')

  const deals = (data?.deals ?? []).filter(d => !filter || d.status === filter)
  const d = stats?.deals

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every collaboration you&apos;ve logged with a scraped creator.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d ? (
          <>
            <KpiCard id="rev" index={0} label="Revenue Won" value={d.revenue_won} format={(n) => formatMoney(n)} sub="completed deals" icon={Trophy} accent="emerald" />
            <KpiCard id="pipe" index={1} label="In Pipeline" value={d.pipeline_value} format={(n) => formatMoney(n)} sub="active deals" icon={Clock} accent="amber" />
            <KpiCard id="total" index={2} label="Total Logged" value={d.total_value} format={(n) => formatMoney(n)} sub="all statuses" icon={TrendingUp} accent="violet" />
            <KpiCard id="count" index={3} label="Deal Count" value={d.deal_count} sub="collaborations" icon={Handshake} accent="cyan" />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/60 p-4">
          <h2 className="font-semibold">All deals</h2>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Handshake className="mb-3 h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm font-medium">No deals yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Open any creator from the Influencers table and add a deal in the <span className="text-foreground">Deals</span> tab to start tracking revenue.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
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
                  <tr key={deal.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={deal.influencer_name || deal.influencer_handle || '?'} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{deal.influencer_name}</p>
                          <p className="text-xs text-muted-foreground">@{deal.influencer_handle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{deal.title}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{formatMoney(deal.deal_value, deal.currency)}</td>
                    <td className="px-3 py-2.5">
                      <Select
                        value={deal.status}
                        onChange={(e) => updateDeal.mutate({ id: deal.id, patch: { status: e.target.value } }, { onSuccess: () => toast.success('Deal updated') })}
                        className={cn('h-7 w-32 border-0 text-xs font-medium', STATUS_STYLE[deal.status])}
                      >
                        <option value="active" className="bg-card text-foreground">Active</option>
                        <option value="completed" className="bg-card text-foreground">Completed</option>
                        <option value="cancelled" className="bg-card text-foreground">Cancelled</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
