'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Download, ArrowUp, ArrowDown, Check, BadgeCheck, X,
  ChevronLeft, ChevronRight, Plus, ExternalLink, LayoutGrid, List, Filter, UserPlus, Bookmark, Trash2,
} from 'lucide-react'
import {
  useInfluencers, useFacets, useAddToPipeline, useRemoveFromPipeline, useAssignments, useAssign, useMembers,
  useSavedLists, useSaveList, useDeleteList,
  type InfluencerFilters,
} from '@/lib/api'
import { useIsAdmin, useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { NicheChip, VerifiedTick, StageBadge } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { FOLLOWER_BUCKETS, formatFollowers, nicheLabel, safeUrl, cn } from '@/lib/utils'
import type { Influencer } from '@/types/database'
import { toast } from 'sonner'

const PAGE_SIZE = 50
type Tab = 'all' | 'mine' | 'members'

export default function InfluencersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <InfluencersInner />
    </Suspense>
  )
}

function InfluencersInner() {
  const params = useSearchParams()
  const isAdmin = useIsAdmin()
  const [tabState, setTab] = useState<Tab>((params.get('tab') as Tab) || 'all')
  // Admins oversee the team — they have no personal assignments, so never land
  // them on the member-only "mine" tab (#9).
  const tab: Tab = isAdmin && tabState === 'mine' ? 'all' : tabState
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => { const o = params.get('open'); if (o) setOpenId(o) }, [params])

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Influencers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isAdmin ? 'Browse the catalog and oversee your team’s assignments.' : 'Browse the catalog, work your assignments, and build your pipeline.'}</p>
        </div>
      </header>

      <div className="flex gap-1 border-b border-border/60">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>All Influencers</TabButton>
        {!isAdmin && <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>My Assignments</TabButton>}
        {isAdmin && <TabButton active={tab === 'members'} onClick={() => setTab('members')}>Team Assignments</TabButton>}
      </div>

      {tab === 'all' && <AllInfluencers isAdmin={isAdmin} onOpen={setOpenId} />}
      {tab === 'mine' && !isAdmin && <MyAssignments onOpen={setOpenId} />}
      {tab === 'members' && isAdmin && <ByMember onOpen={setOpenId} />}

      <InfluencerDrawer influencerId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('relative px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
      {children}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
    </button>
  )
}

// ---- All Influencers tab ----------------------------------------------------

function AllInfluencers({ isAdmin, onOpen }: { isAdmin: boolean; onOpen: (id: string) => void }) {
  const params = useSearchParams()
  const [assignOpen, setAssignOpen] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState(params.get('niche') ?? '')
  const [country, setCountry] = useState(params.get('country') ?? '')
  const [rangeKey, setRangeKey] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [hideInPipeline, setHideInPipeline] = useState(false)
  const [sort, setSort] = useState('follower_count')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // A saved "selection" list pins an explicit set of handles (#6). When active it
  // overrides the field filters.
  const [handleList, setHandleList] = useState<{ name: string; handles: string[] } | null>(null)

  const range = FOLLOWER_BUCKETS.find(r => r.key === rangeKey) ?? FOLLOWER_BUCKETS[0]
  const filters: InfluencerFilters = useMemo(() => handleList ? ({
    handles: handleList.handles, sort, order, page, pageSize: PAGE_SIZE,
  }) : ({
    search: search || undefined, niche: niche || undefined, country: country || undefined,
    minFollowers: range.min, maxFollowers: range.max,
    verifiedOnly: verifiedOnly || undefined, hideInPipeline: hideInPipeline || undefined,
    sort, order, page, pageSize: PAGE_SIZE,
  }), [handleList, search, niche, country, rangeKey, verifiedOnly, hideInPipeline, sort, order, page])

  const { data, isFetching } = useInfluencers(filters)
  const { data: facets } = useFacets()
  const addToPipeline = useAddToPipeline()
  const removeFromPipeline = useRemoveFromPipeline()
  const saveList = useSaveList()
  const me = useAuth()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const grandTotal = facets?.total ?? total
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const activeFilterCount = (search ? 1 : 0) + (niche ? 1 : 0) + (country ? 1 : 0) + (rangeKey ? 1 : 0) + (verifiedOnly ? 1 : 0) + (hideInPipeline ? 1 : 0)
  const resetFilters = () => { setSearchInput(''); setSearch(''); setNiche(''); setCountry(''); setRangeKey(''); setVerifiedOnly(false); setHideInPipeline(false); setPage(1) }

  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => {
    const next = new Set(selected)
    if (allOnPageSelected) rows.forEach(r => next.delete(r.id)); else rows.forEach(r => next.add(r.id))
    setSelected(next)
  }
  const toggleRow = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next) }

  const reportAdd = (r: { added: number; conflicts: { handle: string; assigned_name: string | null }[] }) => {
    if (r.added) toast.success(`Added ${r.added} to pipeline`)
    if (r.conflicts.length) toast.info(`${r.conflicts.length} already owned by a teammate`)
    if (!r.added && !r.conflicts.length) toast.info('Already in pipeline')
  }
  const addOne = (handle: string) => addToPipeline.mutate({ handles: [handle] }, { onSuccess: reportAdd })
  const removeOne = (pipelineId: string) => removeFromPipeline.mutate(pipelineId, { onSuccess: () => toast.success('Removed from pipeline') })
  const canRemove = (inf: Influencer) => !!inf.pipeline_id && (isAdmin || inf.assigned_to === me.id)
  const addSelected = () => {
    const handles = rows.filter(r => selected.has(r.id) && !r.in_pipeline).map(r => r.handle)
    if (!handles.length) { toast.info('Selected creators are already in the pipeline'); return }
    addToPipeline.mutate({ handles }, { onSuccess: (r) => { reportAdd(r); setSelected(new Set()) } })
  }
  const selectedHandles = rows.filter(r => selected.has(r.id)).map(r => r.handle)
  const addableSelected = rows.filter(r => selected.has(r.id) && !r.in_pipeline)
  const removableSelected = rows.filter(r => selected.has(r.id) && canRemove(r))
  const removeSelected = async () => {
    if (!removableSelected.length) return
    if (!window.confirm(`Remove ${removableSelected.length} creator${removableSelected.length > 1 ? 's' : ''} from the pipeline?`)) return
    await Promise.all(removableSelected.map(r => removeFromPipeline.mutateAsync(r.pipeline_id!).catch(() => null)))
    toast.success(`Removed ${removableSelected.length} from pipeline`); setSelected(new Set())
  }
  const saveSelectedAsList = () => {
    if (!selectedHandles.length) return
    const name = window.prompt(`Name this list of ${selectedHandles.length} creator${selectedHandles.length > 1 ? 's' : ''}`)
    if (!name?.trim()) return
    saveList.mutate({ name: name.trim(), filters: { handles: selectedHandles } }, { onSuccess: () => toast.success('List saved') })
  }

  const exportCsv = () => {
    const toExport = selected.size ? rows.filter(r => selected.has(r.id)) : rows
    const cols = ['handle', 'name', 'follower_count', 'niche', 'country', 'in_pipeline', 'email', 'profile_url']
    const head = cols.join(',')
    const body = toExport.map(r => cols.map(c => {
      const v = (r as unknown as Record<string, unknown>)[c] ?? ''
      const cell = String(v).replace(/"/g, '""')
      const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
      return /[",\n]/.test(safe) ? `"${safe}"` : safe
    }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([head + '\n' + body], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'clonyfy-influencers.csv'; a.click(); URL.revokeObjectURL(url)
    toast.success(`Exported ${toExport.length} rows`)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Showing <span className="text-foreground">{total.toLocaleString()}</span> of {grandTotal.toLocaleString()} profiles</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={exportCsv} className="border border-border">
            <Download className="mr-1.5 h-4 w-4" /> Export {selected.size ? `(${selected.size})` : 'CSV'}
          </Button>
        </div>
      </div>

      <SavedLists
        current={{ search, niche, country, rangeKey, verifiedOnly }}
        canSave={activeFilterCount > 0}
        onApply={(list) => {
          const f = (list.filters ?? {}) as SavedFilter & { handles?: string[] }
          if (f.handles?.length) { setHandleList({ name: list.name, handles: f.handles }); setPage(1); return }
          setHandleList(null)
          setSearchInput(f.search || ''); setSearch(f.search || '')
          setNiche(f.niche || ''); setCountry(f.country || ''); setRangeKey(f.rangeKey || '')
          setVerifiedOnly(!!f.verifiedOnly); setPage(1)
        }}
      />
      {handleList && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Bookmark className="h-4 w-4 text-primary" />
          <span>Viewing saved selection <span className="font-medium">{handleList.name}</span> · {handleList.handles.length} creators</span>
          <button onClick={() => { setHandleList(null); setPage(1) }} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Exit selection</button>
        </div>
      )}

      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search handle, name, bio…" className="pl-9" />
          </div>
          <Select value={niche} onChange={(e) => { setNiche(e.target.value); setPage(1) }} className="w-44">
            <option value="">All niches</option>
            {facets?.niche.map(n => <option key={n} value={n}>{nicheLabel(n)}</option>)}
          </Select>
          <Select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1) }} className="w-32">
            <option value="">All countries</option>
            {facets?.country.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </Select>
          <Select value={rangeKey} onChange={(e) => { setRangeKey(e.target.value); setPage(1) }} className="w-36">
            {FOLLOWER_BUCKETS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setVerifiedOnly(v => !v); setPage(1) }}
            className={cn('inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              verifiedOnly ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-border text-muted-foreground hover:bg-muted/60')}>
            <BadgeCheck className="h-3.5 w-3.5" /> Verified
          </button>
          <button onClick={() => { setHideInPipeline(v => !v); setPage(1) }}
            className={cn('inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              hideInPipeline ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-border text-muted-foreground hover:bg-muted/60')}>
            <Filter className="h-3.5 w-3.5" /> Hide in-pipeline
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Clear ({activeFilterCount})
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} className="w-36">
              <option value="follower_count">Followers</option>
              <option value="full_name">Name</option>
              <option value="handle">Handle</option>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')} className="border border-border">
              {order === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
            <div className="flex overflow-hidden rounded-md border border-border">
              <button onClick={() => setView('list')} className={cn('px-2 py-1.5', view === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><List className="h-4 w-4" /></button>
              <button onClick={() => setView('grid')} className={cn('px-2 py-1.5', view === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><LayoutGrid className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl border-primary/30 p-3">
          <span className="text-sm font-medium">{selected.size} selected{addableSelected.length < selected.size ? ` · ${selected.size - addableSelected.length} already in pipeline` : ''}</span>
          {addableSelected.length > 0 && (
            <Button size="sm" onClick={addSelected} disabled={addToPipeline.isPending}><Plus className="mr-1 h-4 w-4" /> Add to Pipeline ({addableSelected.length})</Button>
          )}
          {isAdmin && <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)} className="border border-border"><UserPlus className="mr-1 h-4 w-4" /> Assign to…</Button>}
          {removableSelected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={removeSelected} disabled={removeFromPipeline.isPending} className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"><Trash2 className="mr-1 h-4 w-4" /> Remove from pipeline ({removableSelected.length})</Button>
          )}
          <Button variant="ghost" size="sm" onClick={saveSelectedAsList} disabled={saveList.isPending} className="border border-border"><Bookmark className="mr-1 h-4 w-4" /> Save as list</Button>
          <Button variant="ghost" size="sm" onClick={exportCsv} className="border border-border"><Download className="mr-1 h-4 w-4" /> Export</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {view === 'list' ? (
        <div className="glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-3"><Checkbox checked={allOnPageSelected} onChange={toggleAll} /></th>
                  <th className="px-2 py-3">Creator</th>
                  <th className="px-3 py-3 text-right">Followers</th>
                  <th className="px-3 py-3">Niche</th>
                  <th className="px-3 py-3">Country</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!data && Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40"><td colSpan={6} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
                ))}
                {rows.map(inf => (
                  <Row key={inf.id} inf={inf} selected={selected.has(inf.id)} onToggle={() => toggleRow(inf.id)} onOpen={() => onOpen(inf.id)} onAdd={() => addOne(inf.handle)} adding={addToPipeline.isPending}
                    onRemove={canRemove(inf) ? () => removeOne(inf.pipeline_id!) : undefined} removing={removeFromPipeline.isPending} />
                ))}
                {data && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">No creators match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} total={total} isFetching={isFetching} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {!data && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
            {rows.map(inf => (
              <GridCard key={inf.id} inf={inf} selected={selected.has(inf.id)} onToggle={() => toggleRow(inf.id)} onOpen={() => onOpen(inf.id)} onAdd={() => addOne(inf.handle)} adding={addToPipeline.isPending}
                onRemove={canRemove(inf) ? () => removeOne(inf.pipeline_id!) : undefined} removing={removeFromPipeline.isPending} />
            ))}
          </div>
          <div className="glass mt-4 rounded-2xl">
            <Pagination page={page} pages={pages} total={total} isFetching={isFetching} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          </div>
        </div>
      )}

      {isAdmin && <AssignModal open={assignOpen} onOpenChange={setAssignOpen} handles={selectedHandles} onDone={() => setSelected(new Set())} />}
    </div>
  )
}

// ---- My Assignments tab -----------------------------------------------------

function MyAssignments({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useAssignments()
  const addToPipeline = useAddToPipeline()
  const rows = data?.rows ?? []

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (!rows.length) return <EmptyCard text="No assignments yet. An admin can assign creators to you, or add anyone from All Influencers." />

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Creator</th>
            <th className="px-3 py-3 text-right">Followers</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id} className="border-b border-border/40 hover:bg-muted/30">
              <td className="px-4 py-2.5">
                <button onClick={() => a.influencer_id && onOpen(a.influencer_id)} className="flex items-center gap-3 text-left">
                  <Avatar name={a.full_name} size={34} />
                  <div className="min-w-0"><div className="flex items-center gap-1"><span className="truncate font-medium">{a.full_name}</span><VerifiedTick verified={a.is_verified} /></div><span className="text-xs text-muted-foreground">@{a.handle}</span></div>
                </button>
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatFollowers(a.follower_count)}</td>
              <td className="px-3 py-2.5">{a.status === 'added_to_pipeline' && a.stage ? <StageBadge stage={a.stage} /> : <span className="text-xs text-muted-foreground">Not added yet</span>}</td>
              <td className="px-3 py-2.5 text-right">
                {a.status === 'pending'
                  ? <Button size="sm" variant="ghost" className="border border-border" disabled={addToPipeline.isPending}
                      onClick={() => addToPipeline.mutate({ handles: [a.handle] }, { onSuccess: () => toast.success('Added to pipeline') })}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Pipeline
                    </Button>
                  : <span className="text-xs text-emerald-400">In pipeline</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- By Member tab (admin) --------------------------------------------------

function ByMember({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = useMembers()
  const [memberId, setMemberId] = useState<string | null>(null)
  const members = data?.members ?? []
  const selected = members.find(m => m.id === memberId)
  const { data: asg, isLoading } = useAssignments(memberId ?? undefined, !!memberId)

  if (memberId && selected) {
    const rows = asg?.rows ?? []
    return (
      <div className="space-y-4">
        <button onClick={() => setMemberId(null)} className="text-sm text-primary hover:underline">← All members</button>
        <div className="flex items-center gap-3">
          <Avatar name={selected.name} size={40} />
          <div><p className="font-semibold">{selected.name}</p><p className="text-xs text-muted-foreground">{rows.length} assignments</p></div>
        </div>
        {isLoading ? <Skeleton className="h-64 w-full rounded-2xl" /> : rows.length === 0 ? <EmptyCard text="No assignments for this member yet." /> : (
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3">Creator</th><th className="px-3 py-3 text-right">Followers</th><th className="px-3 py-3">Status</th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-2.5"><button onClick={() => a.influencer_id && onOpen(a.influencer_id)} className="flex items-center gap-3 text-left"><Avatar name={a.full_name} size={32} /><div><span className="font-medium">{a.full_name}</span><span className="block text-xs text-muted-foreground">@{a.handle}</span></div></button></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatFollowers(a.follower_count)}</td>
                    <td className="px-3 py-2.5">{a.status === 'added_to_pipeline' && a.stage ? <StageBadge stage={a.stage} /> : <span className="text-xs text-muted-foreground">Not added yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map(m => (
        <button key={m.id} onClick={() => setMemberId(m.id)} className="glass card-hover flex items-center gap-3 rounded-2xl p-4 text-left">
          <Avatar name={m.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{m.name}</p>
            <p className="text-xs capitalize text-muted-foreground">{m.role} · {m.invite_accepted || m.last_active ? 'active' : 'invited'}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
      {members.length === 0 && <EmptyCard text="No team members yet. Invite some from the Team page." />}
    </div>
  )
}

function AssignModal({ open, onOpenChange, handles, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; handles: string[]; onDone: () => void }) {
  const { data } = useMembers()
  const assign = useAssign()
  const [memberId, setMemberId] = useState('')
  const members = data?.members ?? []

  const submit = () => {
    if (!memberId) { toast.error('Pick a member'); return }
    assign.mutate({ memberId, handles }, {
      onSuccess: (r) => { toast.success(`Assigned ${r.assigned} to ${members.find(m => m.id === memberId)?.name ?? 'member'}`); onOpenChange(false); onDone() },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Assign failed'),
    })
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Assign ${handles.length} creator${handles.length > 1 ? 's' : ''}`} description="They'll appear in the member's My Assignments tab.">
      <div className="space-y-3">
        <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Choose a member…</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
        </Select>
        <Button onClick={submit} disabled={assign.isPending || !handles.length} className="w-full">{assign.isPending ? 'Assigning…' : 'Assign'}</Button>
      </div>
    </Modal>
  )
}

// ---- shared row/card --------------------------------------------------------

function Row({ inf, selected, onToggle, onOpen, onAdd, adding, onRemove, removing }: {
  inf: Influencer; selected: boolean; onToggle: () => void; onOpen: () => void; onAdd: () => void; adding: boolean
  onRemove?: () => void; removing?: boolean
}) {
  const ig = safeUrl(inf.profile_url)
  return (
    <tr className={cn('group border-b border-border/40 transition-colors hover:bg-muted/30', selected && 'bg-primary/5')}>
      <td className="px-4 py-2.5"><Checkbox checked={selected} onChange={onToggle} /></td>
      <td className="px-2 py-2.5">
        <button onClick={onOpen} className="flex items-center gap-3 text-left">
          <Avatar name={inf.name} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1"><span className="truncate font-medium group-hover:text-primary">{inf.name}</span><VerifiedTick verified={inf.is_verified} /></div>
            <span className="text-xs text-muted-foreground">@{inf.handle}</span>
          </div>
        </button>
      </td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatFollowers(inf.follower_count)}</td>
      <td className="px-3 py-2.5"><NicheChip niche={inf.niche} /></td>
      <td className="px-3 py-2.5 text-xs uppercase text-muted-foreground">{inf.country || '—'}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {ig && <a href={ig} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground" title="Open on Instagram"><ExternalLink className="h-3.5 w-3.5" /></a>}
          {inf.in_pipeline
            ? <>
                <span className="inline-flex items-center whitespace-nowrap rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-400" title={inf.assigned_name ? `Assigned to ${inf.assigned_name}` : 'In pipeline'}>
                  In Pipeline{inf.assigned_name ? ` · ${inf.assigned_name}` : ''}
                </span>
                {onRemove && <button onClick={onRemove} disabled={removing} title="Move back — remove from pipeline" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-rose-500/40 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>}
              </>
            : <Button size="sm" variant="ghost" onClick={onAdd} disabled={adding} className="border border-border"><Plus className="mr-1 h-3.5 w-3.5" /> Pipeline</Button>}
        </div>
      </td>
    </tr>
  )
}

function GridCard({ inf, selected, onToggle, onOpen, onAdd, adding, onRemove, removing }: {
  inf: Influencer; selected: boolean; onToggle: () => void; onOpen: () => void; onAdd: () => void; adding: boolean
  onRemove?: () => void; removing?: boolean
}) {
  const ig = safeUrl(inf.profile_url)
  return (
    <div className={cn('glass-strong card-hover relative rounded-2xl p-4', selected && 'ring-1 ring-primary/40')}>
      <div className="absolute right-3 top-3"><Checkbox checked={selected} onChange={onToggle} /></div>
      <button onClick={onOpen} className="flex w-full flex-col items-center text-center">
        <Avatar name={inf.name} size={56} />
        <div className="mt-2 flex items-center gap-1"><span className="truncate font-semibold">{inf.name}</span><VerifiedTick verified={inf.is_verified} /></div>
        <span className="text-xs text-muted-foreground">@{inf.handle}</span>
        <span className="mt-1 text-sm font-bold">{formatFollowers(inf.follower_count)}</span>
      </button>
      <div className="mt-2 flex justify-center"><NicheChip niche={inf.niche} /></div>
      <div className="mt-3 flex items-center gap-1.5">
        {ig && <a href={ig} target="_blank" rel="noreferrer noopener" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
        {inf.in_pipeline
          ? <>
              <span className="flex-1 truncate rounded-md bg-emerald-500/15 py-1.5 text-center text-xs font-medium text-emerald-400" title={inf.assigned_name ? `Assigned to ${inf.assigned_name}` : 'In pipeline'}>In Pipeline{inf.assigned_name ? ` · ${inf.assigned_name}` : ''}</span>
              {onRemove && <button onClick={onRemove} disabled={removing} title="Move back — remove from pipeline" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-rose-500/40 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>}
            </>
          : <Button size="sm" onClick={onAdd} disabled={adding} className="flex-1"><Plus className="mr-1 h-3.5 w-3.5" /> Pipeline</Button>}
      </div>
    </div>
  )
}

function Pagination({ page, pages, total, isFetching, onPrev, onNext }: { page: number; pages: number; total: number; isFetching: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-muted-foreground">Page {page} of {pages} · {total.toLocaleString()} creators {isFetching && <span className="ml-1 animate-pulse text-primary">·updating</span>}</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={onPrev} className="border border-border"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={onNext} className="border border-border"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange() }}
      className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}

type SavedFilter = { search: string; niche: string; country: string; rangeKey: string; verifiedOnly: boolean }
type SavedListRow = { id: string; name: string; filters: unknown; match_count?: number }

function SavedLists({ current, onApply, canSave }: { current: SavedFilter; onApply: (list: SavedListRow) => void; canSave: boolean }) {
  const { data } = useSavedLists()
  const save = useSaveList()
  const del = useDeleteList()
  const lists = data?.lists ?? []
  const onSave = () => {
    const name = window.prompt('Name this list (e.g. "Tech 10K+")')
    if (!name?.trim()) return
    save.mutate({ name: name.trim(), filters: current }, { onSuccess: () => toast.success('List saved') })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Saved lists:</span>
      {lists.length === 0 && <span className="text-xs text-muted-foreground/70">none yet</span>}
      {lists.map(s => (
        <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-border bg-card/60 py-1 pl-3 pr-1 text-xs">
          <button onClick={() => onApply(s as SavedListRow)} className="hover:text-primary">{s.name}</button>
          {typeof s.match_count === 'number' && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground tabular-nums">{s.match_count.toLocaleString()}</span>
          )}
          <button onClick={() => del.mutate(s.id)} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {canSave && (
        <button onClick={onSave} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
          <Bookmark className="h-3 w-3" /> Save current view
        </button>
      )}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return <div className="glass flex flex-col items-center justify-center rounded-2xl py-16 text-center"><p className="max-w-sm text-sm text-muted-foreground">{text}</p></div>
}
