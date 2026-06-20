'use client'

import { useMemo, useState } from 'react'
import { useAudit } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { UserCheck, ArrowRightLeft, UserPlus, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const KIND: Record<string, { label: string; icon: typeof UserCheck; color: string }> = {
  assigned:             { label: 'Assigned', icon: UserCheck, color: 'text-blue-400 bg-blue-500/15' },
  reassigned:           { label: 'Reassigned', icon: ArrowRightLeft, color: 'text-fuchsia-400 bg-fuchsia-500/15' },
  added_to_pipeline:    { label: 'Added', icon: UserPlus, color: 'text-sky-400 bg-sky-500/15' },
  removed_from_pipeline:{ label: 'Removed', icon: Trash2, color: 'text-rose-400 bg-rose-500/15' },
}

export default function AuditPage() {
  const isAdmin = useIsAdmin()
  const { data, isLoading } = useAudit()
  const [kind, setKind] = useState('')

  const entries = useMemo(() => (data?.entries ?? []).filter(e => !kind || e.kind === kind), [data, kind])

  if (!isAdmin) return <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">This page is for admins only.</div>

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Audit Trail</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every assignment, reassignment, and pipeline change across the workspace.</p>
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-48">
          <option value="">All events</option>
          <option value="assigned">Assignments</option>
          <option value="reassigned">Reassignments</option>
          <option value="added_to_pipeline">Pipeline adds</option>
          <option value="removed_from_pipeline">Pipeline removes</option>
        </Select>
      </header>

      <div className="glass rounded-2xl p-4">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No audit events yet.</p>
        ) : (
          <div className="space-y-1.5">
            {entries.map(e => {
              const k = KIND[e.kind] ?? KIND.assigned
              const Icon = k.icon
              return (
                <div key={e.id} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted/40">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${k.color}`}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{e.actor || 'Someone'}</span>{' '}
                      <span className="text-muted-foreground">{e.detail}</span>
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {e.handle && <Avatar name={e.handle} size={16} />}
                      <span className="rounded bg-muted px-1.5 py-px font-medium">{k.label}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
