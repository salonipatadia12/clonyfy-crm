'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Users, Target, ArrowUpRight, Activity, Zap, Radio, Film, Mail, UserCog, AlertTriangle, Clock, CalendarClock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { StageBadge } from '@/components/crm/badges'
import { useOverview } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { MomentumChart } from '@/components/dashboard/momentum-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { NicheDonut } from '@/components/dashboard/charts'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGES, STAGE_HEX, stageLabel, nicheLabel, cn } from '@/lib/utils'
import type { OverviewResponse } from '@/types/database'

export default function DashboardPage() {
  const { data, isLoading } = useOverview()
  const { role, name } = useAuth()
  const isAdmin = role === 'admin'

  if (isLoading || !data) return <DashboardSkeleton />

  const k = data.kpis
  const actSpark = data.series.slice(-14).map(s => s.activity)

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" /> Live workspace
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl"><span className="gradient-text">Command Center</span></h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Welcome back, {name.split(' ')[0]} · {k.totalProfiles.toLocaleString()} creators ·
            {' '}{k.inPipeline.toLocaleString()} {isAdmin ? 'in the team pipeline' : 'in your pipeline'}.
          </p>
        </div>
        <Link href="/crm/influencers" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40">
          Browse influencers <ArrowUpRight className="h-4 w-4" />
        </Link>
      </motion.header>

      {/* KPI row (spec §8 — no $ anywhere) */}
      <div className={cn('grid grid-cols-2 gap-4', isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <KpiCard id="profiles" index={0} label="Total Profiles" value={k.totalProfiles} icon={Users} accent="violet" sub="in your influencers list" />
        <KpiCard id="pipeline" index={1} label="In Pipeline" value={k.inPipeline} icon={Target} accent="amber" sub={`${data.deltas.activity7} actions this week`} spark={actSpark} />
        <KpiCard id="contacted" index={2} label="Contacted" value={k.contacted} icon={Mail} accent="cyan" sub="creators reached out to" />
        <KpiCard id="videos" index={3} label="Videos Generated" value={k.videosGenerated} icon={Film} accent="rose" sub="reels logged on contacts" />
        {isAdmin && <KpiCard id="team" index={4} label="Team Members" value={k.teamMembers} icon={UserCog} accent="emerald" sub="in this workspace" />}
      </div>

      {/* Needs Attention — stale contacts that need a follow-up */}
      {data.needsAttention.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glass rounded-2xl border border-amber-500/20 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Needs Attention
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">{data.needsAttention.length}</span>
            </h2>
            <span className="text-xs text-muted-foreground">No touch in 7+ days</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.needsAttention.map(c => (
              <Link key={c.id} href={`/crm/influencers?open=${c.handle}`}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5 transition-colors hover:border-amber-500/40">
                <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.full_name || c.handle}</p>
                  <p className="truncate text-xs text-muted-foreground">@{c.handle}{isAdmin && c.assigned_name ? ` · ${c.assigned_name}` : ''}</p>
                </div>
                <StageBadge stage={c.stage} />
                <span className="shrink-0 text-[11px] text-muted-foreground">{c.last_touch ? formatDistanceToNow(new Date(c.last_touch), { addSuffix: true }) : ''}</span>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* Follow-ups due — scheduled next-touch dates that have arrived */}
      {data.followUpsDue.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glass rounded-2xl border border-cyan-500/20 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="h-4 w-4 text-cyan-400" /> Follow-ups Due
              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-medium text-cyan-400">{data.followUpsDue.length}</span>
            </h2>
            <span className="text-xs text-muted-foreground">Scheduled for today or earlier</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.followUpsDue.map(c => (
              <Link key={c.id} href={`/crm/influencers?open=${c.handle}`}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5 transition-colors hover:border-cyan-500/40">
                <CalendarClock className="h-4 w-4 shrink-0 text-cyan-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.full_name || c.handle}</p>
                  <p className="truncate text-xs text-muted-foreground">@{c.handle}{isAdmin && c.assigned_name ? ` · ${c.assigned_name}` : ''}</p>
                </div>
                <StageBadge stage={c.stage} />
                <span className="shrink-0 text-[11px] text-muted-foreground">{c.next_follow_up ? formatDistanceToNow(new Date(c.next_follow_up), { addSuffix: true }) : ''}</span>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* momentum + live feed */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Tile delay={0.1} className="lg:col-span-7">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Pipeline Momentum</h2>
              </div>
              <p className="text-sm text-muted-foreground">Outreach activity · last 30 days</p>
            </div>
            <div className="text-right">
              <div className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
                data.deltas.activity >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400')}>
                <Zap className="h-3.5 w-3.5" /> {data.deltas.activity >= 0 ? '+' : ''}{data.deltas.activity.toFixed(0)}%
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{data.deltas.activity7} actions this week</p>
            </div>
          </div>
          <MomentumChart series={data.series} />
        </Tile>

        <Tile delay={0.16} className="lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Radio className="h-4 w-4 text-emerald-400" /> Live Activity
            </h2>
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
          </div>
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <ActivityFeed feed={data.feed} />
          </div>
        </Tile>
      </div>

      {/* funnel + niche */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Tile delay={0.2} className="lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Outreach Funnel</h2>
              <p className="text-sm text-muted-foreground">Creators in your pipeline by stage</p>
            </div>
            <Link href="/crm/pipeline" className="text-sm text-primary hover:underline">Open board</Link>
          </div>
          <Funnel data={data} />
        </Tile>

        <Tile delay={0.32} className="lg:col-span-5">
          <h2 className="mb-1 text-lg font-semibold">Niche Mix</h2>
          <p className="mb-2 text-sm text-muted-foreground">Your creator database by category</p>
          <NicheDonut data={data.byNiche} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {data.byNiche.slice(0, 5).map((n, i) => (
              <span key={n.niche} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'][i % 5] }} />
                {nicheLabel(n.niche)}
              </span>
            ))}
          </div>
        </Tile>
      </div>
    </div>
  )
}

function Tile({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: 'easeOut' }}
      className={cn('glass rounded-2xl p-6', className)}
    >
      {children}
    </motion.section>
  )
}

function Funnel({ data }: { data: OverviewResponse }) {
  const counts = new Map(data.byStage.map(s => [s.stage, s.count]))
  const max = Math.max(1, ...STAGES.map(s => counts.get(s) ?? 0))
  return (
    <div className="space-y-2.5">
      {STAGES.map((stage, i) => {
        const count = counts.get(stage) ?? 0
        const pct = (count / max) * 100
        return (
          <Link key={stage} href={`/crm/pipeline?stage=${stage}`} className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-90">
            <div className="w-24 shrink-0 text-right text-xs font-medium text-muted-foreground">{stageLabel(stage)}</div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-muted/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, count > 0 ? 7 : 0)}%` }}
                transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
                className="flex h-full items-center justify-end rounded-lg px-2 text-xs font-semibold text-white"
                style={{ background: `linear-gradient(90deg, ${STAGE_HEX[stage]}88, ${STAGE_HEX[stage]})` }}
              >
                {count > 0 && count}
              </motion.div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl lg:col-span-8" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-2xl lg:col-span-7" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-5" />
      </div>
    </div>
  )
}
