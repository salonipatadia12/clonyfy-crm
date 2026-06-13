'use client'

import { useStats } from '@/lib/api'
import { NicheDonut, NicheReachBar, RevenueMonthChart } from '@/components/dashboard/charts'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGES, STAGE_HEX, formatMoney, formatNum, cn } from '@/lib/utils'
import { Film } from 'lucide-react'

export default function AnalyticsPage() {
  const { data: stats, isLoading } = useStats()

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-5 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      </div>
    )
  }

  const stageCounts = new Map(stats.byStage.map(s => [s.stage, s.count]))
  const inPipeline = stats.byStage.reduce((a, s) => a + s.count, 0)
  let remaining = inPipeline
  const funnel = STAGES.map(stage => {
    const here = stageCounts.get(stage) ?? 0
    const row = { stage, count: here, reachedPct: inPipeline ? (remaining / inPipeline) * 100 : 0 }
    remaining -= here
    return row
  })

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversion, composition, and revenue across your {stats.totals.total.toLocaleString()} creators.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Funnel conversion */}
        <Panel title="Pipeline Conversion" subtitle={`Close rate ${stats.closeRate.toFixed(1)}% · ${inPipeline.toLocaleString()} in pipeline`}>
          <div className="space-y-3">
            {funnel.map(f => (
              <div key={f.stage}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground">{f.count.toLocaleString()} · {f.reachedPct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.reachedPct}%`, background: STAGE_HEX[f.stage] }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Revenue over time */}
        <Panel title="Revenue Over Time" subtitle="Revenue won per month — your growth signal">
          <RevenueMonthChart data={stats.revenueByMonth ?? []} />
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Revenue Won" value={formatMoney(stats.deals.revenue_won)} accent="text-emerald-400" />
            <Stat label="In Pipeline" value={formatMoney(stats.deals.pipeline_value)} accent="text-amber-400" />
            <Stat label="Total Logged" value={formatMoney(stats.deals.total_value)} accent="text-violet-400" />
          </div>
        </Panel>

        <Panel title="Niche Mix" subtitle="Creators by category">
          <NicheDonut data={stats.byNiche} />
        </Panel>

        <Panel title="Reach by Niche" subtitle="Total followers per category">
          <NicheReachBar data={stats.byNiche} />
        </Panel>

        {/* Top deals */}
        <Panel title="Top Deals by Value" subtitle="Your highest-value collaborations" className="lg:col-span-2">
          {stats.topDeals && stats.topDeals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Creator</th>
                    <th className="px-3 py-2">Deal</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-right">Reel views</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topDeals.map(t => (
                    <tr key={t.id} className="border-b border-border/40">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={t.influencer_name} size={28} />
                          <span className="truncate font-medium">{t.influencer_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          {t.reel_views != null && <Film className="h-3.5 w-3.5 text-cyan-400" />}
                          {t.title}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{formatMoney(t.deal_value)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{t.reel_views != null ? formatNum(t.reel_views) : '—'}</td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No deals with a value yet. Log deals to see your top collaborations.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('glass rounded-2xl p-6 animate-fade-up', className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-center">
      <p className={cn('text-lg font-bold', accent)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
