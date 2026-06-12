import { BadgeCheck } from 'lucide-react'
import { cn, STAGE_COLORS, TIER_STYLES, ENG_STYLES, PRIORITY_STYLES, nicheLabel } from '@/lib/utils'
import type { Stage, Tier, Priority } from '@/types/database'

export function TierBadge({ tier, className }: { tier: Tier | null; className?: string }) {
  if (!tier) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold', TIER_STYLES[tier], className)}>
      {tier}
    </span>
  )
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STAGE_COLORS[stage], className)}>
      {stage}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', PRIORITY_STYLES[priority])}>
      {priority}
    </span>
  )
}

export function NicheChip({ niche }: { niche: string | null }) {
  if (!niche) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
      {nicheLabel(niche)}
    </span>
  )
}

export function EngQuality({ value }: { value: string | null }) {
  if (!value) return null
  return <span className={cn('text-xs font-medium capitalize', ENG_STYLES[value] ?? 'text-muted-foreground')}>{value.replace('_', ' ')}</span>
}

export function VerifiedTick({ verified }: { verified: number }) {
  if (!verified) return null
  return <BadgeCheck className="inline h-4 w-4 text-sky-400" aria-label="verified" />
}
