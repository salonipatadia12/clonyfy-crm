'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Globe, Users, Handshake, DollarSign, Target, ArrowUpRight, Activity, Zap, Radio,
} from 'lucide-react'
import { useOverview } from '@/lib/api'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { MomentumChart } from '@/components/dashboard/momentum-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { Leaderboard } from '@/components/dashboard/leaderboard'
import { NicheDonut } from '@/components/dashboard/charts'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGES, STAGE_HEX, formatFollowers, formatMoney, nicheLabel, cn } from '@/lib/utils'
import type { OverviewResponse } from '@/types/database'

export default function DashboardPage() {
  const { data, isLoading } = useOverview()

  if (isLoading || !data) return <DashboardSkeleton />

  const revSpark = data.series.slice(-14).map(s => s.revenue)
  const actSpark = data.series.slice(-14).map(s => s.activity)

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" /> Live workspace
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl"><span className="gradient-text">Command Center</span></h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {data.totals.total.toLocaleString()} profiles · {formatFollowers(data.totals.reach)} combined audience ·
            {' '}{data.totals.inPipeline.toLocaleString()} working through your pipeline.
          </p>
        </div>
        <Link href="/crm/influencers" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40">
          Browse influencers <ArrowUpRight className="h-4 w-4" />
        </Link>
      </motion.header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard id="profiles" index={0} label="Total Profiles" value={data.totals.total} icon={Users} accent="violet" sub="in your influencers list" />
        <KpiCard id="reach" index={1} label="Combined Audience" value={data.totals.reach} icon={Globe} accent="cyan" format={formatFollowers} sub="sum of follower counts" />
        <KpiCard id="deals" index={2} label="Active Deals" value={data.totals.activeDeals} icon={Handshake} accent="amber" sub={`${data.deltas.newDeals7} new this week`} spark={actSpark} />
        <KpiCard id="rev" index={3} label="Revenue Won" value={data.deals.revenue_won} icon={DollarSign} accent="emerald" format={(n) => formatMoney(n)} sub={`+${formatMoney(data.deltas.revenue7)} this week`} spark={revSpark} />
        <KpiCard id="close" index={4} label="Close Rate" value={data.closeRate} icon={Target} accent="rose" format={(n) => `${n.toFixed(1)}%`} sub="contacted → closed" />
      </div>

      {/* Bento: momentum + live feed */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Tile delay={0.1} className="lg:col-span-8">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Pipeline Momentum</h2>
              </div>
              <p className="text-sm text-muted-foreground">Revenue won & outreach activity · last 30 days</p>
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

        <Tile delay={0.16} className="lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Radio className="h-4 w-4 text-emerald-400" /> Live Activity
            </h2>
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-1">
            <ActivityFeed feed={data.feed} />
          </div>
        </Tile>
      </div>

      {/* Bento: funnel + leaderboard + niche */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Tile delay={0.2} className="lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Outreach Funnel</h2>
              <p className="text-sm text-muted-foreground">Creators in your pipeline by stage</p>
            </div>
            <Link href="/crm/pipeline" className="text-sm text-primary hover:underline">Open board</Link>
          </div>
          <Funnel data={data} />
        </Tile>

        <Tile delay={0.26} className="lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top Partners</h2>
            <Link href="/crm/deals" className="text-sm text-primary hover:underline">Deals</Link>
          </div>
          <p className="-mt-2 mb-2 text-xs text-muted-foreground">By total deal value</p>
          <Leaderboard rows={data.leaderboard} />
        </Tile>

        <Tile delay={0.32} className="lg:col-span-3">
          <h2 className="mb-1 text-lg font-semibold">Niche Mix</h2>
          <p className="mb-2 text-sm text-muted-foreground">By category</p>
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
          <div key={stage} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-xs font-medium text-muted-foreground">{stage}</div>
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
          </div>
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
        <Skeleton className="h-72 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-4" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
      </div>
    </div>
  )
}
