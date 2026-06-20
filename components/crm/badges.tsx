import { BadgeCheck, PenLine } from 'lucide-react'
import { cn, STAGE_COLORS, stageLabel, nicheLabel } from '@/lib/utils'
import type { Stage, ApprovalStatus } from '@/types/database'

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

export function SignedBadge({ signedAt, className }: { signedAt: string | null; className?: string }) {
  if (signedAt) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400', className)}>
        <PenLine className="h-3 w-3" /> Signed
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-400', className)}>
      Unsigned
    </span>
  )
}

const APPROVAL_STYLE: Record<ApprovalStatus, string> = {
  planned:   'bg-slate-500/15 text-slate-400',
  submitted: 'bg-amber-500/15 text-amber-400',
  approved:  'bg-violet-500/15 text-violet-300',
  posted:    'bg-emerald-500/15 text-emerald-400',
}
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  planned: 'Planned', submitted: 'Submitted', approved: 'Approved', posted: 'Posted',
}
export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', APPROVAL_STYLE[status], className)}>
      {APPROVAL_LABEL[status]}
    </span>
  )
}
