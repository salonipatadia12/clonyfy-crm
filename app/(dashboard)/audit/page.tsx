'use client'

import { useMemo, useState } from 'react'
import { UserCheck, ArrowRightLeft, UserPlus, Trash2, ShieldCheck, History } from 'lucide-react'
import { useAudit } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { PageHeader } from '@/components/layout/page-header'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { relativeDate } from '@/lib/domain'
import type { BadgeTone } from '@/components/ui/badge'

const KIND: Record<string, { label: string; icon: typeof UserCheck; tone: BadgeTone }> = {
  assigned:              { label: 'Assigned', icon: UserCheck, tone: 'info' },
  reassigned:            { label: 'Reassigned', icon: ArrowRightLeft, tone: 'warning' },
  added_to_pipeline:     { label: 'Added to a campaign', icon: UserPlus, tone: 'success' },
  removed_from_pipeline: { label: 'Removed from a campaign', icon: Trash2, tone: 'neutral' },
}

export default function AuditPage() {
  const isAdmin = useIsAdmin()
  const { data, isLoading, error, refetch } = useAudit()
  const [kind, setKind] = useState('')

  const entries = useMemo(() => (data?.entries ?? []).filter(e => !kind || e.kind === kind), [data, kind])

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Audit" />
        <EmptyState icon={ShieldCheck} title="Admins only" description="The audit trail is visible to workspace admins." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit"
        description="Every assignment, reassignment and campaign membership change across the workspace."
        actions={
          <Select aria-label="Event type" value={kind} onChange={e => setKind(e.target.value)} containerClassName="w-52">
            <option value="">All events</option>
            {Object.entries(KIND).map(([v, k]) => <option key={v} value={v}>{k.label}</option>)}
          </Select>
        }
      />

      {error ? <ErrorState error={error} onRetry={() => refetch()} />
        : isLoading ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Shimmer key={i} className="h-12 rounded-lg" />)}</div>
        : entries.length === 0 ? (
          <EmptyState
            icon={History}
            title={kind ? 'No events of this type' : 'No audit events yet'}
            description="Assignments, reassignments and campaign membership changes are recorded here as they happen."
          />
        ) : (
          <ul className="surface divide-y divide-border">
            {entries.map(e => {
              const k = KIND[e.kind] ?? KIND.assigned
              const Icon = k.icon
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-medium">{e.actor || 'Someone'}</span>{' '}
                      <span className="text-muted-foreground">{e.detail}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                      <Badge tone={k.tone}>{k.label}</Badge>
                      <span>{relativeDate(e.created_at)}</span>
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}
