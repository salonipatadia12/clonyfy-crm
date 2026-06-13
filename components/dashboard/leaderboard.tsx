'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { StageBadge } from '@/components/crm/badges'
import { formatFollowers, formatMoney } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/database'

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Log a deal value on a creator to see your top commercial relationships here.</p>
  }
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <Link
          key={r.id}
          href={`/crm/influencers?open=${encodeURIComponent(r.id)}`}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
        >
          <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
          <Avatar name={r.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">@{r.handle} · {formatFollowers(r.follower_count)}</p>
          </div>
          <div className="hidden sm:block"><StageBadge stage={r.stage} /></div>
          <span className="w-16 shrink-0 text-right text-sm font-bold text-emerald-400 tabular-nums">{formatMoney(r.deal_total)}</span>
        </Link>
      ))}
    </div>
  )
}
