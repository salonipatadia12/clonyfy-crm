'use client'

import { useAnalytics, useDeals } from '@/lib/api'
import { NicheDonut, NicheReachBar, CountryBar } from '@/components/dashboard/charts'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { Target, TrendingUp, Film, Handshake } from 'lucide-react'
import { STAGES, STAGE_HEX, ADVANCED_STAGES, stageLabel, nicheLabel, formatNum, cn } from '@/lib/utils'
import type { Stage } from '@/types/database'

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics()
  const { data: dealsData } = useDeals()

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-5 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      </div>
    )
  }

  const stageCounts = new Map(data.funnel.map(s => [s.stage, s.count]))
  const inPipeline = data.funnel.reduce((a, s) => a + s.count, 0)
  const advanced = data.funnel.filter(s => ADVANCED_STAGES.includes(s.stage as Stage)).reduce((a, s) => a + s.count, 0)
  const advancedRate = inPipeline ? (advanced / inPipeline) * 100 : 0
  const ds = dealsData?.stats
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
        <p className="mt-1 text-sm text-muted-foreground">Pipeline conversion, deal output, and audience composition.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard id="pipe" index={0} label="In Pipeline" value={inPipeline} sub="creators being worked" icon={Target} accent="violet" />
        <KpiCard id="adv" index={1} label="Advanced" value={advancedRate} format={(n) => `${n.toFixed(0)}%`} sub={`${advanced} past first contact`} icon={TrendingUp} accent="emerald" />
        <KpiCard id="deals" index={2} label="Deals" value={ds?.total ?? 0} sub={`${ds?.active ?? 0} active`} icon={Handshake} accent="amber" />
        <KpiCard id="vids" index={3} label="Videos Posted" value={ds?.videosPosted ?? 0} format={(n) => formatNum(n)} sub={`${formatNum(ds?.totalViews ?? 0)} views`} icon={Film} accent="cyan" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Pipeline Conversion" subtitle={`${inPipeline.toLocaleString()} creators moving through your stages`}>
          <div className="space-y-3">
            {funnel.map(f => (
              <div key={f.stage}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{stageLabel(f.stage)}</span>
                  <span className="text-muted-foreground">{f.count.toLocaleString()} · {f.reachedPct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.reachedPct}%`, background: STAGE_HEX[f.stage] }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Niche Performance" subtitle="Share advancing past first contact">
          {data.nichePerf.length === 0 ? <EmptyRow /> : (
            <div className="space-y-3">
              {data.nichePerf.slice(0, 7).map(n => (
                <div key={n.niche}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{nicheLabel(n.niche)}</span>
                    <span className="text-muted-foreground">{n.advanced}/{n.total} · {n.rate.toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted/40">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${n.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Niche Mix" subtitle="Pipeline creators by category">
          <NicheDonut data={data.nicheMix} />
        </Panel>

        <Panel title="Reach by Niche" subtitle="Total followers per category (catalog)">
          <NicheReachBar data={data.reachByNiche} />
        </Panel>

        <Panel title="Country Mix" subtitle="Pipeline creators by country">
          <CountryBar data={data.countryMix} />
        </Panel>

        {data.members && (
          <Panel title="Team Performance" subtitle="Per-member outreach (admin view)">
            {data.members.length === 0 ? <EmptyRow /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-2">Member</th>
                      <th className="px-2 py-2 text-right">Assigned</th>
                      <th className="px-2 py-2 text-right">Contacted</th>
                      <th className="px-2 py-2 text-right">Responded</th>
                      <th className="px-2 py-2 text-right">Videos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map(m => (
                      <tr key={m.id} className="border-b border-border/40">
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={m.name} size={28} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{m.name}</p>
                              <p className="text-[11px] capitalize text-muted-foreground">{m.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.assigned}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.contacted}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.responded}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{m.videos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
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

function EmptyRow() {
  return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No pipeline data yet</div>
}
