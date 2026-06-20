'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRightLeft, Film, StickyNote, UserPlus, UserCheck, Trash2, Percent, Send } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { stageLabel } from '@/lib/utils'
import type { ActivityEvent, ActivityAction, Stage } from '@/types/database'

const META: Record<ActivityAction, { icon: typeof UserPlus; color: string }> = {
  added_to_pipeline:    { icon: UserPlus, color: 'text-sky-400 bg-sky-500/15' },
  stage_changed:        { icon: ArrowRightLeft, color: 'text-violet-400 bg-violet-500/15' },
  reel_url_added:       { icon: Film, color: 'text-cyan-400 bg-cyan-500/15' },
  notes_updated:        { icon: StickyNote, color: 'text-amber-400 bg-amber-500/15' },
  commission_set:       { icon: Percent, color: 'text-emerald-400 bg-emerald-500/15' },
  reassigned:           { icon: Send, color: 'text-fuchsia-400 bg-fuchsia-500/15' },
  assigned:             { icon: UserCheck, color: 'text-blue-400 bg-blue-500/15' },
  removed_from_pipeline:{ icon: Trash2, color: 'text-rose-400 bg-rose-500/15' },
}

function label(e: ActivityEvent): string {
  const m = (e.metadata ?? {}) as { from?: string; to?: string; reason?: string }
  switch (e.action) {
    case 'added_to_pipeline':     return 'added to pipeline'
    case 'stage_changed':         return `moved to ${stageLabel(m.to as Stage)}`
    case 'reel_url_added':        return 'reel logged'
    case 'notes_updated':         return 'notes updated'
    case 'commission_set':        return 'commission set'
    case 'reassigned':            return 'reassigned'
    case 'assigned':              return 'assigned'
    case 'removed_from_pipeline': return 'removed from pipeline'
    default:                      return e.action
  }
}

export function ActivityFeed({ feed }: { feed: ActivityEvent[] }) {
  if (!feed.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No activity yet — add a creator to the pipeline to get started.</p>
  }
  return (
    <div className="space-y-1.5">
      {feed.map((e, i) => {
        const m = META[e.action] ?? META.notes_updated
        const Icon = m.icon
        const who = e.profile_name || (e.profile_handle ? `@${e.profile_handle}` : 'a creator')
        const href = e.profile_handle ? `/crm/influencers?open=${e.profile_handle}` : '/crm/pipeline'
        return (
          <motion.div
            key={e.id ?? i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.3 }}
          >
            <Link href={href}
              className="flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-border/60 hover:bg-muted/40">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{e.user_name || 'Someone'}</span>{' '}
                  <span className="text-muted-foreground">{label(e)}</span>{' '}
                  <span className="font-medium">{who}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Avatar name={e.profile_name || e.profile_handle || '?'} size={16} />
                  <span>{e.profile_handle ? `@${e.profile_handle}` : 'pipeline'}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
