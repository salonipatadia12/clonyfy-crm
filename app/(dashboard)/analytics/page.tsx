'use client'

import { useStats } from '@/lib/api'
import { NicheDonut, EngagementScatter, NicheReachBar } from '@/components/dashboard/charts'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGES, STAGE_HEX, TIER_HEX, ENG_STYLES, cn } from '@/lib/utils'

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
  const total = stats.totals.total
  // Funnel conversion: cumulative share that reached each stage or beyond.
  let remaining = total
  const funnel = STAGES.map(stage => {
    const here = stageCounts.get(stage) ?? 0
    const row = { stage, count: here, reachedPct: total ? (remaining / total) * 100 : 0 }
    remaining -= here
    return row
  })

  const tierTotal = stats.byTier.reduce((a, t) => a + t.count, 0) || 1

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversion, composition, and engagement across your {total.toLocaleString()} creators.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Funnel conversion */}
        <Panel title="Pipeline Conversion" subtitle="Share of creators that reached each stage">
          <div className="space-y-3">
            {funnel.map(f => (
              <div key={f.stage}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground">{f.count.toLocaleString()} · {f.reachedPct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.reachedPct}%`, background: STAGE_HEX[f.stage] }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Tier split */}
        <Panel title="Quality Tiers" subtitle="A = highest-value, recalculated each scrape">
          <div className="flex h-4 overflow-hidden rounded-full">
            {stats.byTier.map(t => (
              <div key={t.tier} style={{ width: `${(t.count / tierTotal) * 100}%`, background: TIER_HEX[t.tier] }} title={`Tier ${t.tier}: ${t.count}`} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {stats.byTier.map(t => (
              <div key={t.tier} className="rounded-xl border border-border/60 bg-card/40 p-3 text-center">
                <p className="text-2xl font-bold" style={{ color: TIER_HEX[t.tier] }}>{t.count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Tier {t.tier} · {((t.count / tierTotal) * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Engagement quality</p>
            <div className="flex flex-wrap gap-2">
              {stats.byEng.sort((a, b) => b.count - a.count).map(e => (
                <span key={e.eng_quality} className={cn('rounded-md border border-border bg-card/40 px-2 py-1 text-xs', ENG_STYLES[e.eng_quality])}>
                  {e.eng_quality.replace('_', ' ')} · {e.count}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Niche Mix" subtitle="Creators by category">
          <NicheDonut data={stats.byNiche} />
        </Panel>

        <Panel title="Reach by Niche" subtitle="Total followers per category">
          <NicheReachBar data={stats.byNiche} />
        </Panel>

        <Panel title="Engagement vs Reach" subtitle="Each dot is a creator (log scale)" className="lg:col-span-2">
          <EngagementScatter data={stats.scatter} />
          <div className="mt-3 flex gap-4">
            {(['A', 'B', 'C'] as const).map(t => (
              <span key={t} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_HEX[t] }} /> Tier {t}
              </span>
            ))}
          </div>
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
