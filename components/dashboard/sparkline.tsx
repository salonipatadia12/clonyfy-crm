'use client'

import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'

export function Sparkline({ data, color = '#a78bfa', height = 40, id }: { data: number[]; color?: string; height?: number; id: string }) {
  const rows = data.map((v, i) => ({ i, v }))
  const gid = `spark-${id}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 3, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive animationDuration={900} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
