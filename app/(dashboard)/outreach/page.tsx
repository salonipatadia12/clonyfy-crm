'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Send, Info } from 'lucide-react'
import { useOutreach, useCampaignList } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Shimmer, TableSkeleton } from '@/components/ui/states'
import { Table, TableScroll, THead, TH, TR, TD } from '@/components/ui/table'
import { CreatorIdentity, Followers, ContactBadge, StageBadge } from '@/components/crm/creator-badges'
import { Composer } from '@/components/crm/outreach-panel'
import { OUTREACH_QUEUE_META } from '@/lib/outreach-queues'
import { dueLabel, relativeDate, replyStatusLabel } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { OutreachQueue, OutreachRow, Campaign } from '@/types/campaign'

export default function OutreachPage() {
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
    router.replace(`/outreach?${p.toString()}`, { scroll: false })
  }

  const queue = (g('queue') || undefined) as OutreachQueue | undefined
  const campaignId = g('campaignId') || undefined
  const [search, setSearch] = useState(g('search'))

  const { data, isLoading, error, refetch } = useOutreach({ queue, campaignId, search: search || undefined })
  const { data: campaigns } = useCampaignList()
  const [target, setTarget] = useState<OutreachRow | null>(null)
  const campaign = (campaigns ?? []).find(c => c.id === target?.campaign_id)

  const rows = data?.rows ?? []
  const counts = data?.counts

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outreach"
        description="Work queues by channel and by what the conversation needs next. A creator is reachable if any one channel is available — phone is never a requirement."
      />

      {/* Channel + state queues */}
      <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1.5 pb-1" role="tablist" aria-label="Outreach queues">
          <QueueTab active={!queue} label="Everything" count={rows.length} onClick={() => setParam({ queue: null })} description="Every creator in a campaign." />
          {OUTREACH_QUEUE_META.map(q => (
            <QueueTab
              key={q.key}
              active={queue === q.key}
              label={q.label}
              description={q.description}
              count={counts?.[q.key] ?? 0}
              onClick={() => setParam({ queue: q.key })}
            />
          ))}
        </div>
      </div>

      {queue && (
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {OUTREACH_QUEUE_META.find(q => q.key === queue)?.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creators" aria-label="Search creators" className="pl-8" />
        </div>
        <Select aria-label="Campaign" value={campaignId ?? ''} onChange={e => setParam({ campaignId: e.target.value || null })} containerClassName="sm:w-64">
          <option value="">All campaigns</option>
          {(campaigns ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.product_name ? ` — ${c.product_name}` : ''}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="surface overflow-hidden"><TableSkeleton rows={8} cols={6} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title={queue ? 'This queue is empty' : 'No creators to reach out to'}
          description={queue
            ? 'Nothing currently matches this queue. Try "Everything" or a different campaign.'
            : 'Outreach happens inside a campaign so the message can name the right client product. Shortlist creators for a campaign and they appear here.'}
          actions={<Button asChild size="sm"><Link href="/campaigns">Open campaigns</Link></Button>}
        />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map(r => {
              const due = dueLabel(r.next_follow_up)
              return (
                <li key={r.id} className="surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <CreatorIdentity handle={r.handle} fullName={r.full_name} platform={r.platform} />
                    <StageBadge stage={r.stage} />
                  </div>
                  <p className="mt-1 truncate text-2xs text-muted-foreground">{r.campaign_name}{r.product_name ? ` · ${r.product_name}` : ''}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <ContactBadge contactStatus={r.contact_status} email={r.email} phone={r.phone} profileUrl={r.profile_url} verification={r.verification_status} />
                    {due && <Badge tone={due.tone}>{due.text}</Badge>}
                  </div>
                  <Button size="sm" className="mt-2.5 w-full" onClick={() => setTarget(r)}>Compose &amp; log</Button>
                </li>
              )
            })}
          </ul>

          <div className="surface hidden overflow-hidden md:block">
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    <TH>Creator</TH>
                    <TH>Campaign / product</TH>
                    <TH align="right">Followers</TH>
                    <TH>Stage</TH>
                    <TH>Channels</TH>
                    <TH>Last touch</TH>
                    <TH>Outcome</TH>
                    <TH>Follow-up</TH>
                    <TH className="w-32"><span className="sr-only">Actions</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map(r => {
                    const due = dueLabel(r.next_follow_up)
                    return (
                      <TR key={r.id}>
                        <TD><CreatorIdentity handle={r.handle} fullName={r.full_name} platform={r.platform} /></TD>
                        <TD className="text-2xs">
                          <Link href={`/campaigns/${r.campaign_id}`} className="text-primary hover:underline">{r.campaign_name}</Link>
                          {r.product_name && <span className="block text-muted-foreground">{r.product_name}</span>}
                        </TD>
                        <TD align="right"><Followers count={r.follower_count} /></TD>
                        <TD><StageBadge stage={r.stage} /></TD>
                        <TD>
                          <ContactBadge contactStatus={r.contact_status} email={r.email} phone={r.phone} profileUrl={r.profile_url} verification={r.verification_status} />
                        </TD>
                        <TD className="text-2xs text-muted-foreground">
                          {r.outreach_count === 0 ? 'Never contacted' : `${relativeDate(r.last_outreach_at)} · ${r.outreach_count} touch${r.outreach_count === 1 ? '' : 'es'}`}
                        </TD>
                        <TD className="text-2xs">{r.last_reply_status ? replyStatusLabel(r.last_reply_status) : <span className="text-muted-foreground">—</span>}</TD>
                        <TD>{due ? <Badge tone={due.tone}>{due.text}</Badge> : <span className="text-2xs text-muted-foreground">None set</span>}</TD>
                        <TD align="right"><Button size="xs" onClick={() => setTarget(r)}>Compose &amp; log</Button></TD>
                      </TR>
                    )
                  })}
                </tbody>
              </Table>
            </TableScroll>
          </div>
        </>
      )}

      {target && campaign && (
        <Composer campaign={campaign as Campaign} creator={target} onClose={() => setTarget(null)} />
      )}
    </div>
  )
}

function QueueTab({ active, label, count, description, onClick }: {
  active: boolean; label: string; count: number; description: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={description}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] transition-colors',
        active ? 'border-primary bg-primary/10 font-medium text-primary'
               : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('rounded-sm px-1 text-2xs tnum', active ? 'bg-primary/15' : 'bg-muted')}>{count}</span>
    </button>
  )
}
