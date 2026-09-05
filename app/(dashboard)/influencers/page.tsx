'use client'

import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ExternalLink, Download, FolderPlus, CheckCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import {
  TableScroll, Table, THead, TH, TR, TD, Checkbox,
} from '@/components/ui/table'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states'
import { CreatorDrawer } from '@/components/crm/creator-drawer'
import {
  useCreators, useCreatorFacets, useCampaignList, useAddCreatorsToCampaign,
  useBulkUpdateCampaignCreators,
} from '@/lib/queries'
import {
  creatorStanding, STANDING_LABELS, STANDING_TONE, ccStageLabel, CC_STAGE_TONE,
} from '@/lib/domain'
import { formatNum, nicheLabel, safeUrl, toggleIn } from '@/lib/utils'
import { FOLLOWER_RANGES } from '@/components/crm/creator-view-config'
import type { CreatorRow } from '@/types/campaign'

export default function InfluencersPage() {
  return <Suspense fallback={<TableSkeleton rows={10} cols={9} />}><Influencers /></Suspense>
}

function Influencers() {
  const router = useRouter()
  const params = useSearchParams()
  const g = (k: string) => params?.get(k) ?? ''

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Filters live in the URL so a filtered list can be shared or bookmarked. */
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in patch)) next.delete('page')
    setSelected(new Set())
    router.replace(`/influencers${next.toString() ? `?${next}` : ''}`, { scroll: false })
  }

  const range = FOLLOWER_RANGES.find(r => r.key === g('size'))
  const page = Math.max(1, Number(g('page')) || 1)

  const query = {
    // The saved view 'us' already means "confirmed or likely US"; reusing it
    // keeps the checkbox and the server's definition of US in one place.
    view: (g('us') ? 'us' : 'all') as 'us' | 'all',
    search: g('q') || undefined,
    niche: g('niche') || undefined,
    geoStatus: undefined,
    contact: g('contact') || undefined,
    minFollowers: range?.min,
    maxFollowers: range?.max,
    campaignId: g('campaign') || undefined,
    ccStage: g('status') || undefined,
    page,
    pageSize: 50,
  }

  const { data, isLoading, error, refetch } = useCreators(query)
  const { data: facets } = useCreatorFacets()
  const { data: campaigns } = useCampaignList()

  // Contact status is resolved on the server, so "Contacted" means every
  // contacted influencer — not just the ones on the current page.
  const rows = data?.rows ?? []

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 50))
  const allOnPage = rows.length > 0 && rows.every(r => selected.has(r.id))

  const chips = [
    g('q') && { k: 'q', label: `“${g('q')}”` },
    g('niche') && { k: 'niche', label: nicheLabel(g('niche')) },
    g('us') && { k: 'us', label: 'In the US' },
    g('contact') === 'email' && { k: 'contact', label: 'Has email' },
    g('contact') === 'phone' && { k: 'contact', label: 'Has phone' },
    g('size') && { k: 'size', label: range?.label ?? '' },
    g('status') && { k: 'status', label: ccStageLabel(g('status')) },
    g('campaign') && { k: 'campaign', label: campaigns?.find(c => c.id === g('campaign'))?.name ?? 'Campaign' },
  ].filter(Boolean) as { k: string; label: string }[]

  const exportCsv = () => {
    const picked = rows.filter(r => selected.has(r.id))
    const list = picked.length ? picked : rows
    const head = ['Name', 'Instagram', 'Profile link', 'Email', 'Phone', 'Followers', 'Niche', 'US', 'Contact status', 'Campaigns']
    const csv = [head, ...list.map(r => [
      r.full_name ?? '', r.handle, r.profile_url ?? '', r.email ?? '', r.phone ?? '',
      r.follower_count ?? '', nicheLabel(r.niche), usLabel(r.geo_status),
      (r.campaigns ?? []).map(c => ccStageLabel(c.stage)).join(' / ') || 'Not contacted',
      (r.campaigns ?? []).map(c => c.campaign_name).join(' / '),
    ])].map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `influencers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${list.length} influencer${list.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Influencers"
        description="Everyone in your list, with the contact details you have for them."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </Button>
        }
      />

      {/* Filters ------------------------------------------------------- */}
      <div className="surface space-y-3 p-3.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            key={g('q')}
            defaultValue={g('q')}
            placeholder="Search name or username"
            aria-label="Search influencers"
            onChange={e => {
              const v = e.target.value
              if (searchTimer.current) clearTimeout(searchTimer.current)
              searchTimer.current = setTimeout(() => setParam({ q: v || null }), 350)
            }}
          />
          <Select aria-label="Niche" value={g('niche')} onChange={e => setParam({ niche: e.target.value || null })}>
            <option value="">All niches</option>
            {(facets?.niche ?? []).map(n => (
              <option key={n.value} value={n.value}>{nicheLabel(n.value)} ({formatNum(n.count)})</option>
            ))}
          </Select>
          <Select aria-label="Follower range" value={g('size')} onChange={e => setParam({ size: e.target.value || null })}>
            {FOLLOWER_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
          <Select aria-label="Campaign" value={g('campaign')} onChange={e => setParam({ campaign: e.target.value || null })}>
            <option value="">Any campaign</option>
            {(campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle on={!!g('us')} onClick={() => setParam({ us: g('us') ? null : '1' })}>US only</Toggle>
          <Toggle on={g('contact') === 'email'} onClick={() => setParam({ contact: g('contact') === 'email' ? null : 'email' })}>Has email</Toggle>
          <Toggle on={g('contact') === 'phone'} onClick={() => setParam({ contact: g('contact') === 'phone' ? null : 'phone' })}>Has phone</Toggle>
          <Select
            aria-label="Contact status"
            value={g('status')}
            containerClassName="w-44"
            onChange={e => setParam({ status: e.target.value || null })}
          >
            <option value="">Any contact status</option>
            <option value="not_contacted">Not contacted</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="interested">Interested</option>
            <option value="declined">Declined</option>
          </Select>
          {chips.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              {chips.map(c => (
                <button
                  key={c.k}
                  onClick={() => setParam({ [c.k]: null })}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-2xs hover:text-foreground"
                >
                  {c.label}<X className="h-3 w-3" aria-hidden />
                </button>
              ))}
              <Button variant="link" size="xs" onClick={() => router.replace('/influencers')}>Clear all</Button>
            </>
          )}
        </div>
      </div>

      {/* Bulk bar ------------------------------------------------------ */}
      {selected.size > 0 && (
        <div className="surface flex flex-wrap items-center gap-2 border-primary/30 px-3.5 py-2.5">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Add to campaign
          </Button>
          <MarkContacted ids={[...selected]} rows={rows} onDone={() => setSelected(new Set())} />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </Button>
          <Button variant="link" size="xs" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table --------------------------------------------------------- */}
      {error ? <ErrorState error={error} onRetry={() => refetch()} />
        : isLoading ? <TableSkeleton rows={10} cols={9} />
        : rows.length === 0 ? (
          <EmptyState
            title="No influencers match these filters"
            description="Try removing a filter, or clear them all to see the whole list."
            actions={<Button size="sm" onClick={() => router.replace('/influencers')}>Clear filters</Button>}
          />
        ) : (
          <>
            <p className="text-2xs text-muted-foreground">
              Showing <span className="tnum font-medium text-foreground">{formatNum(rows.length)}</span> of{' '}
              <span className="tnum font-medium text-foreground">{formatNum(total)}</span> influencers
            </p>
            <TableScroll className="surface">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-9">
                      <Checkbox
                        label="Select all on this page"
                        checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map(r => r.id)))}
                      />
                    </TH>
                    <TH>Influencer</TH>
                    <TH>Instagram</TH>
                    <TH>Email</TH>
                    <TH>Phone</TH>
                    <TH align="right">Followers</TH>
                    <TH>Niche</TH>
                    <TH>US</TH>
                    <TH>Contact status</TH>
                    <TH>Campaign</TH>
                  </TR>
                </THead>
                <tbody>
                  {rows.map(r => {
                    const standing = creatorStanding(r)
                    const link = safeUrl(r.profile_url)
                    const membership = (r.campaigns ?? [])[0]
                    return (
                      <TR key={r.id}>
                        <TD>
                          <Checkbox
                            label={`Select ${r.handle}`}
                            checked={selected.has(r.id)}
                            onChange={() => setSelected(s => toggleIn(s, r.id))}
                          />
                        </TD>
                        <TD>
                          <button onClick={() => setOpenId(r.id)} className="max-w-[200px] text-left">
                            <span className="block truncate text-[13px] font-medium hover:underline">
                              {r.full_name || '@' + r.handle}
                            </span>
                            <Badge tone={STANDING_TONE[standing]} className="mt-0.5">
                              {STANDING_LABELS[standing]}
                            </Badge>
                          </button>
                        </TD>
                        <TD>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex max-w-[150px] items-center gap-1 truncate text-[13px] text-primary hover:underline">
                              @{r.handle}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                            </a>
                          ) : <span className="text-[13px]">@{r.handle}</span>}
                        </TD>
                        <TD>
                          {r.email
                            ? <a href={`mailto:${r.email}`} className="block max-w-[190px] truncate text-[13px] text-primary hover:underline">{r.email}</a>
                            : <Muted>No email</Muted>}
                        </TD>
                        <TD>{r.phone ? <span className="text-[13px]">{r.phone}</span> : <Muted>No phone</Muted>}</TD>
                        <TD align="right" className="tnum text-[13px]">
                          {r.follower_count == null ? <Muted>—</Muted> : formatNum(r.follower_count)}
                        </TD>
                        <TD className="text-[13px]">{r.niche ? nicheLabel(r.niche) : <Muted>—</Muted>}</TD>
                        <TD><UsCell status={r.geo_status} /></TD>
                        <TD>
                          {membership
                            ? <Badge tone={CC_STAGE_TONE[membership.stage as never] ?? 'neutral'}>{ccStageLabel(membership.stage)}</Badge>
                            : <Muted>Not in a campaign</Muted>}
                        </TD>
                        <TD>
                          {(r.campaigns ?? []).length ? (
                            <span className="flex flex-col gap-0.5">
                              {(r.campaigns ?? []).slice(0, 2).map(c => (
                                <Link key={c.campaign_id} href={`/campaigns/${c.campaign_id}`}
                                  className="max-w-[170px] truncate text-2xs text-primary hover:underline">
                                  {c.campaign_name}
                                </Link>
                              ))}
                              {(r.campaigns ?? []).length > 2 && (
                                <span className="text-2xs text-muted-foreground">+{(r.campaigns ?? []).length - 2} more</span>
                              )}
                            </span>
                          ) : <Muted>—</Muted>}
                        </TD>
                      </TR>
                    )
                  })}
                </tbody>
              </Table>
            </TableScroll>

            {pages > 1 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs text-muted-foreground">Page {page} of {formatNum(pages)}</span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>Next</Button>
                </span>
              </div>
            )}
          </>
        )}

      <CreatorDrawer creatorId={openId} onOpenChange={o => { if (!o) setOpenId(null) }} />
      <AddToCampaign
        open={addOpen}
        onOpenChange={setAddOpen}
        ids={[...selected]}
        onDone={() => { setAddOpen(false); setSelected(new Set()) }}
      />
    </div>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) =>
  <span className="text-[13px] text-muted-foreground">{children}</span>

function usLabel(status: string) {
  return status === 'confirmed_us' ? 'Yes' : status === 'likely_us' ? 'Likely' : status === 'non_us' ? 'No' : 'Unknown'
}

/** One column, three readings, no five-value vocabulary to learn. */
function UsCell({ status }: { status: string }) {
  if (status === 'confirmed_us') return <Badge tone="success">Yes</Badge>
  if (status === 'likely_us') return <Badge tone="info">Likely</Badge>
  if (status === 'non_us') return <Badge tone="neutral">No</Badge>
  return <Muted>Unknown</Muted>
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] transition-colors ${
        on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

/** Marks every selected influencer contacted in each campaign they belong to. */
function MarkContacted({ ids, rows, onDone }: { ids: string[]; rows: CreatorRow[]; onDone: () => void }) {
  const bulk = useBulkUpdateCampaignCreators()
  const ccIds = rows
    .filter(r => ids.includes(r.id))
    .flatMap(r => (r.campaigns ?? []).map(c => `${c.campaign_id}:${r.id}`))

  const memberships = rows
    .filter(r => ids.includes(r.id))
    .flatMap(r => (r.campaigns ?? []).filter(c => c.stage === 'not_contacted'))

  const disabled = memberships.length === 0
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || bulk.isPending}
      title={disabled
        ? 'Select influencers who are in a campaign and not yet contacted.'
        : `Mark ${memberships.length} campaign membership${memberships.length === 1 ? '' : 's'} contacted.`}
      onClick={() => {
        const targetIds = rows.filter(r => ids.includes(r.id))
          .flatMap(r => (r.campaigns ?? []).filter(c => c.stage === 'not_contacted').map(c => c.membership_id))
          .filter((v): v is string => !!v)
        if (!targetIds.length) return
        bulk.mutate({ ids: targetIds, stage: 'contacted' }, {
          onSuccess: () => { toast.success(`Marked ${targetIds.length} contacted.`); onDone() },
          onError: e => toast.error(e.message),
        })
      }}
    >
      <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark contacted
      {ccIds.length === 0 && ''}
    </Button>
  )
}

function AddToCampaign({ open, onOpenChange, ids, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  ids: string[]
  onDone: () => void
}) {
  const { data: campaigns } = useCampaignList()
  const add = useAddCreatorsToCampaign()
  const [campaignId, setCampaignId] = useState('')

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add to campaign"
      description={`${ids.length} influencer${ids.length === 1 ? '' : 's'} will be added as "Not contacted".`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!campaignId || add.isPending}
            onClick={() => add.mutate({ campaignId, influencerIds: ids, stage: 'not_contacted' }, {
              onSuccess: r => { toast.success(`Added ${r.added} influencer${r.added === 1 ? '' : 's'}.`); onDone() },
              onError: e => toast.error(e.message),
            })}
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <Labelled label="Campaign">
        <Select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
          <option value="">Choose a campaign…</option>
          {(campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Labelled>
      <p className="mt-2 text-2xs text-muted-foreground">
        Someone already in the campaign is skipped, not duplicated.
      </p>
    </Modal>
  )
}
