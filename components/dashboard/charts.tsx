'use client'

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, BarChart, Bar,
} from 'recharts'
import { NICHE_HEX, nicheLabel, formatFollowers } from '@/lib/utils'

const tooltipStyle = {
  background: 'hsl(240 14% 6%)',
  border: '1px solid hsl(240 8% 16%)',
  borderRadius: 12,
  fontSize: 12,
  color: '#fff',
}

export function NicheDonut({ data }: { data: { niche: string; count: number }[] }) {
  const rows = data.map(d => ({ name: nicheLabel(d.niche), value: d.count }))
  if (!rows.length) return <Empty />
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

export function NicheReachBar({ data }: { data: { niche: string; reach: number }[] }) {
  const rows = [...data].sort((a, b) => b.reach - a.reach).map(d => ({ name: nicheLabel(d.niche), reach: d.reach }))
  if (!rows.length) return <Empty />
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

export function CountryBar({ data }: { data: { country: string; count: number }[] }) {
  const rows = [...data].sort((a, b) => b.count - a.count).slice(0, 10).map(d => ({ name: (d.country || '—').toUpperCase(), count: d.count }))
  if (!rows.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fill: 'hsl(240 6% 60%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" />
        <YAxis type="category" dataKey="name" width={56} tick={{ fill: 'hsl(240 6% 70%)', fontSize: 11 }} stroke="hsl(240 8% 20%)" />
        <Tooltip cursor={{ fill: 'hsl(190 80% 50% / 0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {rows.map((_, i) => <Cell key={i} fill={NICHE_HEX[i % NICHE_HEX.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data yet</div>
}
