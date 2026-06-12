'use client'

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatMoney } from '@/lib/utils'
import type { OverviewResponse } from '@/types/database'

const fmtDate = (d: string) => {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function MomentumChart({ series }: { series: OverviewResponse['series'] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={series} margin={{ top: 10, right: 8, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 16%)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'hsl(240 6% 55%)', fontSize: 11 }} stroke="hsl(240 8% 18%)" minTickGap={28} />
        <YAxis yAxisId="rev" tickFormatter={(v) => formatMoney(v)} tick={{ fill: 'hsl(240 6% 55%)', fontSize: 11 }} stroke="hsl(240 8% 18%)" width={48} />
        <YAxis yAxisId="act" orientation="right" hide />
        <Tooltip
          contentStyle={{ background: 'hsl(240 14% 6%)', border: '1px solid hsl(240 8% 16%)', borderRadius: 12, fontSize: 12 }}
          itemStyle={{ color: '#fff' }} labelStyle={{ color: 'hsl(240 6% 65%)' }}
          formatter={(v: number, n: string) => n === 'Revenue' ? [formatMoney(v), 'Revenue won'] : [v, 'Activity']}
          labelFormatter={(l) => `Day ${fmtDate(String(l))}`}
        />
        <Bar yAxisId="act" dataKey="activity" name="Activity" fill="hsl(190 90% 55%)" fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke="#a78bfa" strokeWidth={2.5} fill="url(#revFill)" isAnimationActive animationDuration={1100} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
