'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDeliverables, useCampaignList, useCampaignCreators } from '@/lib/queries'
import { useMembers } from '@/lib/api'
import { PageHeader } from '@/components/layout/page-header'
import { Select } from '@/components/ui/select'
import { ErrorState, Shimmer, TableSkeleton } from '@/components/ui/states'
import { DeliverableTable } from '@/components/crm/deliverable-table'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'all', label: 'All', description: 'Every deliverable across the campaigns you can see.' },
  { key: 'due_soon', label: 'Due soon', description: 'Due in the next 7 days and not yet published.' },
  { key: 'overdue', label: 'Overdue', description: 'The due date has passed and the content is not published.' },
  { key: 'awaiting_approval', label: 'Awaiting approval', description: 'A draft has been submitted and is waiting on your review.' },
  { key: 'published', label: 'Published', description: 'Live content. Performance numbers are entered by hand.' },
] as const

export default function DeliverablesPage() {
  return (
    <Suspense fallback={<Shimmer className="h-96 rounded-xl" />}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const params = useSearchParams()
  const g = (k: string) => params?.get(k) ?? ''
  const setParam = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    router.replace(`/deliverables?${p.toString()}`, { scroll: false })
  }

  const view = g('view') || 'all'
  const campaignId = g('campaignId') || undefined
  const ownerId = g('ownerId') || undefined

  const { data, isLoading, error, refetch } = useDeliverables({ view, campaignId, ownerId })
  const { data: campaigns } = useCampaignList()
  const { data: members } = useMembers()
  const { data: campaignCreators } = useCampaignCreators({ campaignId })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deliverables"
        description="What creators owe, what is waiting on approval and what has gone live. Every performance number here was typed in by a person — Clonify does not read platform metrics."
      />

      <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1.5 pb-1" role="tablist" aria-label="Deliverable views">
          {VIEWS.map(v => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              title={v.description}
              onClick={() => setParam({ view: v.key === 'all' ? null : v.key })}
              className={cn(
                'whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] transition-colors',
                view === v.key ? 'border-primary bg-primary/10 font-medium text-primary'
                               : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-2xs text-muted-foreground">{VIEWS.find(v => v.key === view)?.description}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Campaign" value={campaignId ?? ''} onChange={e => setParam({ campaignId: e.target.value || null })} containerClassName="sm:w-64">
          <option value="">All campaigns</option>
          {(campaigns ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.product_name ? ` — ${c.product_name}` : ''}</option>
          ))}
        </Select>
        <Select aria-label="Owner" value={ownerId ?? ''} onChange={e => setParam({ ownerId: e.target.value || null })} containerClassName="sm:w-48">
          <option value="">All owners</option>
          {(members?.members ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      {error ? <ErrorState error={error} onRetry={() => refetch()} />
        : isLoading ? <div className="surface overflow-hidden"><TableSkeleton rows={8} cols={7} /></div>
        : <DeliverableTable rows={data ?? []} creators={campaignCreators} />}
    </div>
  )
}
