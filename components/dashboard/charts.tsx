'use client'

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, BarChart, Bar,
} from 'recharts'
import { NICHE_HEX, nicheLabel, formatFollowers, formatMoney } from '@/lib/utils'
import type { StatsResponse, RevenueMonth } from '@/types/database'

const monthLabel = (m: string) => {
  const [, mm] = m.split('-')
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] ?? m
}

const tooltipStyle = {
  background: 'hsl(240 14% 6%)',
  border: '1px solid hsl(240 8% 16%)',
  borderRadius: 12,
  fontSize: 12,
  color: '#fff',
}

export function NicheDonut({ data }: { data: StatsResponse['byNiche'] }) {
  const rows = data.map(d => ({ name: nicheLabel(d.niche), value: d.count }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={NICHE_HEX[i % NICHE_HEX.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function RevenueMonthChart({ data }: { data: RevenueMonth[] }) {
  const rows = data.map(d => ({ name: monthLabel(d.month), revenue: d.revenue }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 10, right: 12, bottom: 4, left: -4 }}>
        <defs>
          <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 16%)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" />
        <YAxis tickFormatter={(v) => formatMoney(v)} tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" width={48} />
        <Tooltip cursor={{ fill: 'hsl(160 80% 45% / 0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} formatter={(v: number) => [formatMoney(v), 'Revenue won']} />
        <Bar dataKey="revenue" fill="url(#revBar)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function NicheReachBar({ data }: { data: StatsResponse['byNiche'] }) {
  const rows = [...data].sort((a, b) => b.reach - a.reach).map(d => ({ name: nicheLabel(d.niche), reach: d.reach }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tickFormatter={(v) => formatFollowers(v)} tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" />
        <YAxis type="category" dataKey="name" width={92} tick={{ fill: 'hsl(240 6% 70%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" />
        <Tooltip cursor={{ fill: 'hsl(263 85% 67% / 0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} formatter={(v: number) => formatFollowers(v)} />
        <Bar dataKey="reach" radius={[0, 6, 6, 0]}>
          {rows.map((_, i) => <Cell key={i} fill={NICHE_HEX[i % NICHE_HEX.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
