'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCountUp } from './use-count-up'
import { Sparkline } from './sparkline'

const ACCENTS: Record<string, { glow: string; icon: string; spark: string }> = {
  violet: { glow: 'from-violet-500/25', icon: 'text-violet-300 bg-violet-500/15', spark: '#a78bfa' },
  emerald: { glow: 'from-emerald-500/25', icon: 'text-emerald-300 bg-emerald-500/15', spark: '#34d399' },
  amber: { glow: 'from-amber-500/25', icon: 'text-amber-300 bg-amber-500/15', spark: '#fbbf24' },
  cyan: { glow: 'from-cyan-500/25', icon: 'text-cyan-300 bg-cyan-500/15', spark: '#22d3ee' },
  rose: { glow: 'from-rose-500/25', icon: 'text-rose-300 bg-rose-500/15', spark: '#fb7185' },
}

export function KpiCard({
  id, label, value, icon: Icon, accent = 'violet', format = (n) => Math.round(n).toLocaleString(),
  delta, spark, sub, index = 0,
}: {
  id: string
  label: string
  value: number
  icon: LucideIcon
  accent?: keyof typeof ACCENTS
  format?: (n: number) => string
  delta?: number
  spark?: number[]
  sub?: string
  index?: number
}) {
  const animated = useCountUp(value)
  const a = ACCENTS[accent]
  const up = (delta ?? 0) >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="glass-strong card-hover kpi-ring group relative overflow-hidden rounded-2xl p-5"
    >
      <div className={cn('pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-opacity group-hover:opacity-90', a.glow)} />
      <div className="relative flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', a.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        {delta != null && (
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
            up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400')}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="relative mt-3 text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="relative mt-0.5 text-[28px] font-bold leading-tight tracking-tight tabular-nums">{format(animated)}</p>
      {sub && <p className="relative mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {spark && spark.length > 1 && (
        <div className="relative -mx-1 mt-2 h-10">
          <Sparkline data={spark} color={a.spark} id={id} height={40} />
        </div>
      )}
    </motion.div>
  )
}
