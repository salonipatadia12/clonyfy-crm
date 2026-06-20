'use client'

import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type Series = { date: string; activity: number }[]

const fmtDate = (d: string) => {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

// Outreach activity over time (no revenue — money is hidden from the CRM).
export function MomentumChart({ series }: { series: Series }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={series} margin={{ top: 10, right: 8, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(190 90% 55%)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="hsl(190 90% 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 16%)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'hsl(240 6% 55%)', fontSize: 11 }} stroke="hsl(240 8% 18%)" minTickGap={28} />
        <YAxis tick={{ fill: 'hsl(240 6% 55%)', fontSize: 11 }} stroke="hsl(240 8% 18%)" width={36} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'hsl(240 14% 6%)', border: '1px solid hsl(240 8% 16%)', borderRadius: 12, fontSize: 12 }}
          itemStyle={{ color: '#fff' }} labelStyle={{ color: 'hsl(240 6% 65%)' }}
          formatter={(v: number) => [v, 'Actions']}
          labelFormatter={(l) => `Day ${fmtDate(String(l))}`}
        />
        <Area type="monotone" dataKey="activity" name="Activity" stroke="hsl(190 90% 55%)" strokeWidth={2.5} fill="url(#actFill)" isAnimationActive animationDuration={1100} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
