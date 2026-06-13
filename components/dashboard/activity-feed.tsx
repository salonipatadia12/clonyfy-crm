'use client'

import { motion } from 'framer-motion'
import { ArrowRightLeft, Handshake, StickyNote, UserPlus, Trophy, Send } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { formatMoney } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { ActivityEvent } from '@/types/database'

const META: Record<string, { icon: typeof Handshake; color: string }> = {
  added: { icon: UserPlus, color: 'text-sky-400 bg-sky-500/15' },
  stage: { icon: ArrowRightLeft, color: 'text-violet-400 bg-violet-500/15' },
  deal: { icon: Handshake, color: 'text-amber-400 bg-amber-500/15' },
  closed: { icon: Trophy, color: 'text-emerald-400 bg-emerald-500/15' },
  note: { icon: StickyNote, color: 'text-orange-400 bg-orange-500/15' },
  dm: { icon: Send, color: 'text-cyan-400 bg-cyan-500/15' },
}

function label(e: ActivityEvent): string {
  const who = e.name || e.handle || 'a creator'
  switch (e.kind) {
    case 'added': return `added ${who} to Pipeline`
    case 'stage': return `moved ${who} to ${e.detail}`
    case 'deal': return `logged a deal with ${who}${e.value ? ` — ${formatMoney(e.value)}` : ''}`
    case 'closed': return `closed a deal with ${who}${e.value ? ` — ${formatMoney(e.value)}` : ''}`
    case 'note': return `noted on ${who}: ${e.detail ?? ''}`
    case 'dm': return `sent a DM to ${who}`
    default: return `${e.kind} ${who}`
  }
}

export function ActivityFeed({ feed }: { feed: ActivityEvent[] }) {
  if (!feed.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No activity yet — add a creator to the pipeline or log a deal.</p>
  }
  return (
    <div className="space-y-1">
      {feed.map((e, i) => {
        const m = META[e.kind] ?? META.note
        const Icon = m.icon
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.color}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <Avatar name={e.name || e.handle || '?'} size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="text-muted-foreground">You </span>{label(e)}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(e.ts), { addSuffix: false })}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
