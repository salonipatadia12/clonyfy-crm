'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { StageBadge, TierBadge } from '@/components/crm/badges'
import { formatFollowers } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/database'

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Move creators into the pipeline to see your top partners here.</p>
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
            <p className="truncate text-xs text-muted-foreground">@{r.handle}</p>
          </div>
          <div className="hidden sm:block"><StageBadge stage={r.stage} /></div>
          <TierBadge tier={r.quality_tier} />
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">{formatFollowers(r.follower_count)}</span>
        </Link>
      ))}
    </div>
  )
}
