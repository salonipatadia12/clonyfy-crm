'use client'

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts'
import { NICHE_HEX, TIER_HEX, nicheLabel, formatFollowers } from '@/lib/utils'
import type { StatsResponse } from '@/types/database'

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

export function EngagementScatter({ data }: { data: StatsResponse['scatter'] }) {
  const byTier: Record<string, typeof data> = { A: [], B: [], C: [] }
  data.forEach(d => { (byTier[d.tier] ?? byTier.C).push(d) })
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 16%)" />
        <XAxis
          type="number" dataKey="x" name="Followers" scale="log" domain={['auto', 'auto']}
          tickFormatter={(v) => formatFollowers(v)} tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }}
          stroke="hsl(240 8% 20%)"
        />
        <YAxis
          type="number" dataKey="y" name="Engagement" unit="%"
          tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }} stroke="hsl(240 8% 20%)"
        />
        <ZAxis range={[28, 28]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: 'hsl(263 85% 67%)' }}
          contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }}
          formatter={(v: number, n: string) => n === 'Followers' ? formatFollowers(v) : `${v}%`}
        />
        {(['C', 'B', 'A'] as const).map(t => (
          <Scatter key={t} name={`Tier ${t}`} data={byTier[t]} fill={TIER_HEX[t]} fillOpacity={t === 'A' ? 0.95 : 0.5} />
        ))}
      </ScatterChart>
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
