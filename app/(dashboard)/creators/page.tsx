'use client'

import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search, SlidersHorizontal, X, Download, UserPlus, Users, Columns3, Rows3,
  ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCreators, useCreatorFacets, useCampaignList, useAddCreatorsToCampaign, type CreatorFilters } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { EmptyState, ErrorState, TableSkeleton, Shimmer } from '@/components/ui/states'
import { Table, TableScroll, THead, TH, SortableTH, TR, TD, Checkbox } from '@/components/ui/table'
import {
  GeoBadge, EntityBadge, QualificationBadge, ContactBadge, ProfileLink, NicheChip,
  Followers, CreatorIdentity,
} from '@/components/crm/creator-badges'
import { CreatorDrawer } from '@/components/crm/creator-drawer'
import { CREATOR_VIEW_LIST, FOLLOWER_RANGES, CREATOR_COLUMNS, type ColumnKey } from '@/components/crm/creator-view-config'
import { DEFAULT_CREATOR_VIEW } from '@/lib/crm-views'
import { geoLabel, entityLabel, qualificationLabel, relativeDate } from '@/lib/domain'
import { nicheLabel, platformLabel, formatNum, downloadCsv, cn, toggleIn } from '@/lib/utils'
import type { CreatorRow } from '@/types/campaign'

const PAGE_SIZE = 50

export default function CreatorsPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Shimmer className="h-8 w-40" /><Shimmer className="h-96 rounded-xl" /></div>}>
      <CreatorsInner />
    </Suspense>
  )
}

function CreatorsInner() {
  const router = useRouter()
  const params = useSearchParams()

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Filter state lives in the URL so a view can be shared, bookmarked and
  // restored by the back button. Changing any filter also drops the selection:
  // a bulk action must never reach a row the user can no longer see.
  const setParam = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    if (!('page' in next)) p.delete('page')
    setSelected(new Set())
    router.replace(`/creators?${p.toString()}`, { scroll: false })
  }, [params, router])

  const g = (k: string) => params?.get(k) ?? ''
  const view = g('view') || DEFAULT_CREATOR_VIEW
  const page = Number(g('page') || '1') || 1
  const sort = g('sort') || 'follower_count'
  const order = (g('order') as 'asc' | 'desc') || 'desc'
  const range = FOLLOWER_RANGES.find(r => r.key === g('size')) ?? FOLLOWER_RANGES[0]

  // The search box is uncontrolled and keyed off the URL value, so typing does
  // not need an effect to push state back into it. The debounce writes to the
  // URL, which is the single source of truth for every filter.
  const urlSearch = g('search')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setParam({ search: value || null }), 350)
  }

  const filters: CreatorFilters = useMemo(() => ({
    view,
    search: g('search') || undefined,
    niche: g('niche') || undefined,
    geoStatus: g('geo') || undefined,
    platform: g('platform') || undefined,
    contact: g('contact') || undefined,
    verification: g('verification') || undefined,
    entityType: g('entity') || undefined,
    campaignId: g('campaignId') || undefined,
    notInCampaignId: g('notInCampaignId') || undefined,
    notForClientId: g('notForClientId') || undefined,
    minFollowers: range.min,
    maxFollowers: range.max,
    sort, order, page, pageSize: PAGE_SIZE,
  }), [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isFetching, error, refetch } = useCreators(filters)
  const { data: facets } = useCreatorFacets()
  const { data: campaigns } = useCampaignList()

  const [openId, setOpenId] = useState<string | null>(g('open') || null)
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable')
  const [columns, setColumns] = useState<Set<ColumnKey>>(
    () => new Set(CREATOR_COLUMNS.filter(c => c.default).map(c => c.key)),
  )
  const [addOpen, setAddOpen] = useState(false)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const viewTotal = data?.viewTotal ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const chips = activeChips(params)
  const clearAll = () => router.replace(`/creators?view=${view}`, { scroll: false })

  const toggleAll = () => {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))
  }

  const exportSelection = () => {
    const chosen = selected.size ? rows.filter(r => selected.has(r.id)) : rows
    downloadCsv(`clonify-creators-${new Date().toISOString().slice(0, 10)}.csv`,
      chosen.map(r => ({
        handle: r.handle, name: r.full_name, followers: r.follower_count,
        niche: nicheLabel(r.niche), platform: platformLabel(r.platform),
        geography: geoLabel(r.geo_status), geography_evidence: r.geo_evidence,
        language_code: r.language_code, email: r.email, phone: r.phone,
        classification: entityLabel(r.entity_type), qualification: qualificationLabel(r.qualification_status),
        profile_url: r.profile_url, campaigns: r.campaigns.map(c => c.campaign_name).join(' | '),
      })),
      [
        { key: 'handle', label: 'Handle' }, { key: 'name', label: 'Name' },
        { key: 'followers', label: 'Followers' }, { key: 'niche', label: 'Niche' },
        { key: 'platform', label: 'Platform' }, { key: 'geography', label: 'Geography' },
        { key: 'geography_evidence', label: 'Geography evidence' },
        { key: 'language_code', label: 'Source language code' },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
        { key: 'classification', label: 'Classification' }, { key: 'qualification', label: 'Qualification' },
        { key: 'profile_url', label: 'Profile URL' }, { key: 'campaigns', label: 'Campaigns' },
      ])
    toast.success(`Exported ${chosen.length} creator${chosen.length === 1 ? '' : 's'}.`)
  }

  const filterControls = (
    <FilterControls params={params} setParam={setParam} facets={facets} campaigns={campaigns ?? []} />
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Creators"
        description="Evaluate and shortlist creators for a client product. Records are separated by how much is actually known about them."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportSelection} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!selected.size}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Add to campaign
            </Button>
          </>
        }
      />

      {/* Saved views */}
      <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1.5 pb-1" role="tablist" aria-label="Saved views">
          {CREATOR_VIEW_LIST.map(v => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              title={v.description}
              onClick={() => setParam({ view: v.key, page: null })}
              className={cn(
                'whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] transition-colors',
                view === v.key
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {CREATOR_VIEW_LIST.find(v => v.key === view)?.description}
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            key={urlSearch}
            defaultValue={urlSearch}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search handle, name or bio"
            aria-label="Search creators"
            className="pl-8"
          />
        </div>

        {/* Desktop filters inline; mobile filters in a sheet. */}
        <div className="hidden flex-wrap items-center gap-2 lg:flex">{filterControls}</div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="default" className="lg:hidden">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
              {chips.length > 0 && <Badge tone="info">{chips.length}</Badge>}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-xl"
            title="Filter creators"
            description="Narrow the catalog by niche, size, geography confidence, platform and contact availability."
          >
            <div className="grid gap-3 overflow-y-auto p-4">{filterControls}</div>
          </SheetContent>
        </Sheet>

        <div className="ml-auto flex items-center gap-1.5">
          <ColumnPicker columns={columns} setColumns={setColumns} />
          <Button
            variant="outline"
            size="icon"
            aria-pressed={density === 'compact'}
            title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
            onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
          >
            <Rows3 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Toggle row density</span>
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(c => (
            <button
              key={c.key}
              onClick={() => setParam({ [c.key]: null })}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="font-medium text-foreground">{c.label}:</span> {c.value}
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <Button variant="link" size="xs" onClick={clearAll}>Clear all</Button>
        </div>
      )}

      {/* Count. total can never exceed viewTotal: both come from the same
          predicate on the server, so the old "4,593 of 4,579" is impossible. */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <span aria-live="polite">
          {isLoading ? 'Loading…' : (
            <>
              <span className="font-medium text-foreground tnum">{formatNum(total)}</span>
              {total !== viewTotal && <> of <span className="tnum">{formatNum(viewTotal)}</span> in this view</>}
              {data && <> · <span className="tnum">{formatNum(data.catalogTotal)}</span> in the catalog</>}
            </>
          )}
        </span>
        {selected.size > 0 && (
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{selected.size} selected</span>
            <Button variant="link" size="xs" onClick={() => setSelected(new Set())}>Clear selection</Button>
          </span>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="surface overflow-hidden"><TableSkeleton rows={10} cols={6} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No creators match these filters"
          description={chips.length
            ? 'Loosen or clear the filters, or switch to the "All records" view to include ones that still need review.'
            : 'This view is empty. Try "All records" to see everything in the catalog.'}
          actions={
            <>
              {chips.length > 0 && <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button>}
              <Button size="sm" onClick={() => setParam({ view: 'all' })}>Show all records</Button>
            </>
          }
        />
      ) : (
        <>
          {/* Mobile: cards. The desktop table is not squeezed onto a phone. */}
          <ul className="space-y-2 md:hidden">
            {rows.map(r => (
              <CreatorCard
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onToggle={() => setSelected(s => toggleIn(s, r.id))}
                onOpen={() => setOpenId(r.id)}
              />
            ))}
          </ul>

          <div className={cn('surface hidden overflow-hidden md:block', isFetching && 'opacity-70 transition-opacity')}>
            <TableScroll density={density} className="relative max-h-[calc(100dvh-22rem)] overflow-y-auto">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-9">
                      <Checkbox
                        label="Select all creators on this page"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                      />
                    </TH>
                    <SortableTH label="Creator" field="handle" sort={sort} order={order} onSort={f => setParam({ sort: f, order: sort === f && order === 'desc' ? 'asc' : 'desc' })} />
                    {columns.has('followers') && <SortableTH label="Followers" field="follower_count" align="right" sort={sort} order={order} onSort={f => setParam({ sort: f, order: sort === f && order === 'desc' ? 'asc' : 'desc' })} />}
                    {columns.has('niche') && <TH>Niche</TH>}
                    {columns.has('geo') && <TH>Geography</TH>}
                    {columns.has('contact') && <TH>Contact</TH>}
                    {columns.has('classification') && <TH>Classification</TH>}
                    {columns.has('qualification') && <TH>Status</TH>}
                    {columns.has('platform') && <TH>Profile</TH>}
                    {columns.has('campaigns') && <TH>Campaigns</TH>}
                    {columns.has('verified') && <SortableTH label="Verified" field="last_verified_at" sort={sort} order={order} onSort={f => setParam({ sort: f, order: sort === f && order === 'desc' ? 'asc' : 'desc' })} />}
                    <TH className="w-16"><span className="sr-only">Actions</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map(r => (
                    <TR key={r.id}>
                      <TD>
                        <Checkbox
                          label={`Select ${r.handle}`}
                          checked={selected.has(r.id)}
                          onChange={() => setSelected(s => toggleIn(s, r.id))}
                        />
                      </TD>
                      <TD>
                        <button onClick={() => setOpenId(r.id)} className="max-w-[220px] text-left hover:underline">
                          <CreatorIdentity handle={r.handle} fullName={r.full_name} platform={r.platform} />
                        </button>
                      </TD>
                      {columns.has('followers') && <TD align="right"><Followers count={r.follower_count} /></TD>}
                      {columns.has('niche') && <TD><NicheChip niche={r.niche} /></TD>}
                      {columns.has('geo') && <TD><GeoBadge status={r.geo_status} evidence={r.geo_evidence} /></TD>}
                      {columns.has('contact') && <TD><ContactBadge contactStatus={r.contact_status} email={r.email} phone={r.phone} profileUrl={r.profile_url} verification={r.verification_status} /></TD>}
                      {columns.has('classification') && <TD><EntityBadge type={r.entity_type} /></TD>}
                      {columns.has('qualification') && <TD><QualificationBadge status={r.qualification_status} /></TD>}
                      {columns.has('platform') && <TD><ProfileLink url={r.profile_url} /></TD>}
                      {columns.has('campaigns') && (
                        <TD>
                          {r.campaigns.length === 0
                            ? <span className="text-2xs text-muted-foreground">None</span>
                            : <span className="flex flex-wrap gap-1">
                                {r.campaigns.slice(0, 2).map(c => <Badge key={c.campaign_id} tone="outline" title={`${c.campaign_name} · ${c.stage}`}>{c.campaign_name}</Badge>)}
                                {r.campaigns.length > 2 && <Badge tone="neutral">+{r.campaigns.length - 2}</Badge>}
                              </span>}
                        </TD>
                      )}
                      {columns.has('verified') && <TD><span className="text-2xs text-muted-foreground">{relativeDate(r.last_verified_at)}</span></TD>}
                      <TD align="right">
                        <Button variant="ghost" size="xs" onClick={() => setOpenId(r.id)}>Open</Button>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </div>

          <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </Button>
            <span className="text-[13px] text-muted-foreground tnum">Page {page} of {formatNum(pages)}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </nav>
        </>
      )}

      <AddToCampaignModal
        open={addOpen}
        onOpenChange={setAddOpen}
        ids={[...selected]}
        onDone={() => { setSelected(new Set()); setAddOpen(false) }}
      />
      <CreatorDrawer creatorId={openId} onOpenChange={(o: boolean) => { if (!o) setOpenId(null) }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function FilterControls({ params, setParam, facets, campaigns }: {
  params: ReturnType<typeof useSearchParams>
  setParam: (n: Record<string, string | null>) => void
  facets: ReturnType<typeof useCreatorFacets>['data']
  campaigns: { id: string; name: string; client_id: string | null; client_name: string | null }[]
}) {
  const g = (k: string) => params?.get(k) ?? ''
  const clients = Array.from(new Map(campaigns.filter(c => c.client_id).map(c => [c.client_id!, c.client_name ?? 'Client'])).entries())
  return (
    <>
      <Select aria-label="Niche" value={g('niche')} onChange={e => setParam({ niche: e.target.value || null })} containerClassName="lg:w-40">
        <option value="">All niches</option>
        {/* A campaign's brief can pin several niches at once; keep that value
            selectable so the chip and the dropdown never disagree. */}
        {g('niche').includes(',') && (
          <option value={g('niche')}>{g('niche').split(',').map(nicheLabel).join(' + ')}</option>
        )}
        {(facets?.niche ?? []).map(n => <option key={n.value} value={n.value}>{nicheLabel(n.value)} ({n.count})</option>)}
      </Select>
      <Select aria-label="Follower range" value={g('size')} onChange={e => setParam({ size: e.target.value || null })} containerClassName="lg:w-36">
        {FOLLOWER_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </Select>
      <Select aria-label="Geography" value={g('geo')} onChange={e => setParam({ geo: e.target.value || null })} containerClassName="lg:w-44">
        <option value="">Any geography</option>
        {(facets?.geo_status ?? []).map(o => <option key={o.value} value={o.value}>{geoLabel(o.value)} ({o.count})</option>)}
      </Select>
      <Select aria-label="Platform" value={g('platform')} onChange={e => setParam({ platform: e.target.value || null })} containerClassName="lg:w-36">
        <option value="">Any platform</option>
        {(facets?.platform ?? []).map(o => <option key={o.value} value={o.value}>{platformLabel(o.value)} ({o.count})</option>)}
      </Select>
      <Select aria-label="Contact availability" value={g('contact')} onChange={e => setParam({ contact: e.target.value || null })} containerClassName="lg:w-44">
        <option value="">Any contact route</option>
        <option value="instagram">Instagram DM available</option>
        <option value="email">Email available</option>
        <option value="phone">Phone available</option>
        <option value="either">Email or phone</option>
        <option value="none">No contact recorded</option>
      </Select>
      <Select aria-label="Verification" value={g('verification')} onChange={e => setParam({ verification: e.target.value || null })} containerClassName="lg:w-44">
        <option value="">Any verification state</option>
        <option value="instagram_verified">Instagram verified</option>
        <option value="pending_instagram_verification">Awaiting verification</option>
      </Select>
      <Select aria-label="Classification" value={g('entity')} onChange={e => setParam({ entity: e.target.value || null })} containerClassName="lg:w-44">
        <option value="">Any classification</option>
        {(facets?.entity_type ?? []).map(o => <option key={o.value} value={o.value}>{entityLabel(o.value)} ({o.count})</option>)}
      </Select>
      <Select aria-label="Campaign membership" value={g('campaignId')} onChange={e => setParam({ campaignId: e.target.value || null })} containerClassName="lg:w-48">
        <option value="">Any campaign membership</option>
        {campaigns.map(c => <option key={c.id} value={c.id}>In: {c.name}</option>)}
      </Select>
      <Select aria-label="Exclude campaign members" value={g('notInCampaignId')} onChange={e => setParam({ notInCampaignId: e.target.value || null })} containerClassName="lg:w-52">
        <option value="">Not filtered by exclusion</option>
        {campaigns.map(c => <option key={c.id} value={c.id}>Not already in: {c.name}</option>)}
      </Select>
      {clients.length > 0 && (
        <Select aria-label="Exclude creators used for a client" value={g('notForClientId')} onChange={e => setParam({ notForClientId: e.target.value || null })} containerClassName="lg:w-56">
          <option value="">Not filtered by client history</option>
          {clients.map(([id, name]) => <option key={id} value={id}>Never used for: {name}</option>)}
        </Select>
      )}
    </>
  )
}

function activeChips(params: ReturnType<typeof useSearchParams>) {
  const g = (k: string) => params?.get(k) ?? ''
  const out: { key: string; label: string; value: string }[] = []
  if (g('search')) out.push({ key: 'search', label: 'Search', value: g('search') })
  if (g('niche')) out.push({ key: 'niche', label: 'Niche', value: g('niche').split(',').map(nicheLabel).join(', ') })
  if (g('size')) out.push({ key: 'size', label: 'Size', value: FOLLOWER_RANGES.find(r => r.key === g('size'))?.label ?? g('size') })
  if (g('geo')) out.push({ key: 'geo', label: 'Geography', value: geoLabel(g('geo')) })
  if (g('platform')) out.push({ key: 'platform', label: 'Platform', value: platformLabel(g('platform')) })
  if (g('contact')) out.push({ key: 'contact', label: 'Contact', value: g('contact') })
  if (g('verification')) out.push({ key: 'verification', label: 'Verification', value: g('verification') === 'instagram_verified' ? 'Verified' : 'Awaiting' })
  if (g('entity')) out.push({ key: 'entity', label: 'Classification', value: entityLabel(g('entity')) })
  if (g('campaignId')) out.push({ key: 'campaignId', label: 'In campaign', value: 'selected' })
  if (g('notInCampaignId')) out.push({ key: 'notInCampaignId', label: 'Not in campaign', value: 'selected' })
  if (g('notForClientId')) out.push({ key: 'notForClientId', label: 'Never used for client', value: 'selected' })
  return out
}

function ColumnPicker({ columns, setColumns }: { columns: Set<ColumnKey>; setColumns: (s: Set<ColumnKey>) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)} title="Choose columns">
        <Columns3 className="h-4 w-4" aria-hidden />
        <span className="sr-only">Choose columns</span>
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Columns" description="Choose which columns the creator table shows." size="sm">
        <div className="space-y-1.5">
          {CREATOR_COLUMNS.map(c => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-[13px] hover:bg-accent">
              <Checkbox
                label={c.label}
                checked={columns.has(c.key)}
                onChange={() => setColumns(toggleIn(columns, c.key))}
              />
              {c.label}
            </label>
          ))}
        </div>
      </Modal>
    </>
  )
}

function CreatorCard({ row, selected, onToggle, onOpen }: {
  row: CreatorRow; selected: boolean; onToggle: () => void; onOpen: () => void
}) {
  return (
    <li className={cn('surface p-3', selected && 'border-primary')}>
      <div className="flex items-start gap-2.5">
        <Checkbox label={`Select ${row.handle}`} checked={selected} onChange={onToggle} className="mt-0.5" />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <CreatorIdentity handle={row.handle} fullName={row.full_name} platform={row.platform} />
        </button>
        <span className="shrink-0 text-[13px] font-medium tnum"><Followers count={row.follower_count} /></span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <NicheChip niche={row.niche} />
        <GeoBadge status={row.geo_status} evidence={row.geo_evidence} />
        <ContactBadge contactStatus={row.contact_status} email={row.email} phone={row.phone} profileUrl={row.profile_url} verification={row.verification_status} />
        <QualificationBadge status={row.qualification_status} />
      </div>
      {row.campaigns.length > 0 && (
        <p className="mt-2 text-2xs text-muted-foreground">
          In {row.campaigns.map(c => c.campaign_name).join(', ')}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <ProfileLink url={row.profile_url} className="text-2xs" />
        <Button variant="outline" size="xs" onClick={onOpen}>Open profile</Button>
      </div>
    </li>
  )
}

function AddToCampaignModal({ open, onOpenChange, ids, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; onDone: () => void
}) {
  const { data: campaigns, isLoading } = useCampaignList()
  const add = useAddCreatorsToCampaign()
  const [campaignId, setCampaignId] = useState('')
  const [stage, setStage] = useState('shortlisted')

  const submit = async () => {
    if (!campaignId) return
    try {
      const r = await add.mutateAsync({ campaignId, influencerIds: ids, stage, source: 'bulk' })
      const parts = [`${r.added} added`]
      if (r.alreadyPresent) parts.push(`${r.alreadyPresent} already in this campaign`)
      if (r.skipped.length) parts.push(`${r.skipped.length} not found`)
      toast.success(parts.join(' · '))
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add these creators.')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Add ${ids.length} creator${ids.length === 1 ? '' : 's'} to a campaign`}
      description="Each creator gets their own stage in this campaign. Adding them here does not change their stage in any other campaign."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!campaignId || add.isPending}>
            {add.isPending ? 'Adding…' : 'Add to campaign'}
          </Button>
        </>
      }
    >
      {isLoading ? <Shimmer className="h-20" /> : !campaigns?.length ? (
        <EmptyState
          compact
          title="No campaigns yet"
          description="Create a campaign for a client product first — a creator is always shortlisted for something specific."
          actions={<Button asChild size="sm"><Link href="/campaigns/new">Create a campaign</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Campaign</span>
            <Select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              <option value="">Choose a campaign…</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.product_name ? ` — ${c.product_name}` : ''}{c.client_name ? ` (${c.client_name})` : ''}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Starting stage</span>
            <Select value={stage} onChange={e => setStage(e.target.value)}>
              <option value="suggested">Suggested</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="ready_to_contact">Ready to contact</option>
            </Select>
          </label>
          <p className="text-2xs text-muted-foreground">
            A fit score is calculated against this campaign&apos;s creator brief as each creator is added.
          </p>
        </div>
      )}
    </Modal>
  )
}
