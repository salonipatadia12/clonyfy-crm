import { BadgeCheck } from 'lucide-react'
import { cn, STAGE_COLORS, stageLabel, nicheLabel } from '@/lib/utils'
import type { Stage } from '@/types/database'

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STAGE_COLORS[stage], className)}>
      {stageLabel(stage)}
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

export function VerifiedTick({ verified }: { verified: boolean | number | null }) {
  if (!verified) return null
  return <BadgeCheck className="inline h-4 w-4 text-sky-400" aria-label="verified" />
}
