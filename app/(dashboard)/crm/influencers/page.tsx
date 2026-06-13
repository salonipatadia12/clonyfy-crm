'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Download, ArrowUp, ArrowDown, Check, BadgeCheck, X, Bookmark,
  ChevronLeft, ChevronRight, Plus, ExternalLink, LayoutGrid, List, Filter,
} from 'lucide-react'
import {
  useInfluencers, useFacets, useAddToPipeline, useSegments, useAddSegment, useDeleteSegment,
  type InfluencerFilters,
} from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { NicheChip, VerifiedTick } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { AddByUrlModal } from '@/components/crm/add-by-url-modal'
import { formatFollowers, nicheLabel, safeUrl, cn } from '@/lib/utils'
import type { Influencer } from '@/types/database'
import { toast } from 'sonner'

const PAGE_SIZE = 50
const RANGES = [
  { key: '', label: 'All sizes', min: undefined, max: undefined },
  { key: '1-10', label: '1K – 10K', min: 1000, max: 10000 },
  { key: '10-50', label: '10K – 50K', min: 10000, max: 50000 },
  { key: '50-500', label: '50K – 500K', min: 50000, max: 500000 },
  { key: '500+', label: '500K+', min: 500000, max: undefined },
]

export default function InfluencersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <InfluencersInner />
    </Suspense>
  )
}

function InfluencersInner() {
  const params = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => { const o = params.get('open'); if (o) setOpenId(o) }, [params])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState('')
  const [market, setMarket] = useState('')
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

  const range = RANGES.find(r => r.key === rangeKey) ?? RANGES[0]
  const filters: InfluencerFilters = useMemo(() => ({
    search: search || undefined,
    niche: niche ? [niche] : undefined,
    market: market ? [market] : undefined,
    minFollowers: range.min,
    maxFollowers: range.max,
    verifiedOnly: verifiedOnly || undefined,
    notInPipeline: hideInPipeline || undefined,
    sort, order, page, pageSize: PAGE_SIZE,
  }), [search, niche, market, rangeKey, verifiedOnly, hideInPipeline, sort, order, page])

  const { data, isFetching } = useInfluencers(filters)
  const { data: facets } = useFacets()
  const addToPipeline = useAddToPipeline()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const grandTotal = facets?.total ?? total
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const activeFilterCount = (search ? 1 : 0) + (niche ? 1 : 0) + (market ? 1 : 0) + (rangeKey ? 1 : 0) + (verifiedOnly ? 1 : 0) + (hideInPipeline ? 1 : 0)
  const resetFilters = () => { setSearchInput(''); setSearch(''); setNiche(''); setMarket(''); setRangeKey(''); setVerifiedOnly(false); setHideInPipeline(false); setPage(1) }

  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => {
    const next = new Set(selected)
    if (allOnPageSelected) rows.forEach(r => next.delete(r.id)); else rows.forEach(r => next.add(r.id))
    setSelected(next)
  }
  const toggleRow = (id: string) => {
    const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next)
  }

  const addOne = (id: string) => addToPipeline.mutate([id], { onSuccess: (r) => toast.success(r.added ? 'Added to pipeline' : 'Already in pipeline') })
  const addSelected = () => {
    const ids = rows.filter(r => selected.has(r.id) && !r.in_pipeline).map(r => r.id)
    if (!ids.length) { toast.info('Selected creators are already in the pipeline'); return }
    addToPipeline.mutate(ids, { onSuccess: (r) => { toast.success(`Added ${r.added} to pipeline`); setSelected(new Set()) } })
  }

  const exportCsv = () => {
    const toExport = selected.size ? rows.filter(r => selected.has(r.id)) : rows
    const cols = ['handle', 'name', 'follower_count', 'niche', 'market', 'in_pipeline', 'email', 'profile_url']
    const head = cols.join(',')
    const body = toExport.map(r => cols.map(c => {
      const v = (r as any)[c] ?? ''
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
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Influencers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your discovery pool — showing <span className="text-foreground">{total.toLocaleString()}</span> of {grandTotal.toLocaleString()} profiles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add by URL</Button>
          <Button variant="ghost" onClick={exportCsv} className="border border-border">
            <Download className="mr-1.5 h-4 w-4" /> Export {selected.size ? `(${selected.size})` : 'CSV'}
          </Button>
        </div>
      </header>

      <SavedLists
        current={{ search, niche, market, rangeKey, verifiedOnly, sort, order }}
        onApply={(f) => {
          setSearchInput(f.search || ''); setSearch(f.search || '')
          setNiche(f.niche || ''); setMarket(f.market || ''); setRangeKey(f.rangeKey || '')
          setVerifiedOnly(!!f.verifiedOnly); setSort(f.sort || 'follower_count'); setOrder(f.order || 'desc'); setPage(1)
        }}
        canSave={activeFilterCount > 0}
      />

      {/* Toolbar */}
      <div className="glass space-y-3 rounded-2xl p-4 animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search handle, name, bio…" className="pl-9" />
          </div>
          <Select value={niche} onChange={(e) => { setNiche(e.target.value); setPage(1) }} className="w-44">
            <option value="">All niches</option>
            {facets?.niche.map(n => <option key={n} value={n}>{nicheLabel(n)}</option>)}
          </Select>
          <Select value={market} onChange={(e) => { setMarket(e.target.value); setPage(1) }} className="w-32">
            <option value="">All markets</option>
            {facets?.market.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={rangeKey} onChange={(e) => { setRangeKey(e.target.value); setPage(1) }} className="w-36">
            {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
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
              <option value="name">Name</option>
              <option value="market">Market</option>
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

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl border-primary/30 p-3 animate-fade-up">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={addSelected} disabled={addToPipeline.isPending}><Plus className="mr-1 h-4 w-4" /> Add to Pipeline</Button>
          <Button variant="ghost" size="sm" onClick={exportCsv} className="border border-border"><Download className="mr-1 h-4 w-4" /> Export</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* List or grid */}
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
                  <th className="px-3 py-3">Market</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!data && Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40"><td colSpan={6} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
                ))}
                {rows.map(inf => (
                  <Row key={inf.id} inf={inf} selected={selected.has(inf.id)} onToggle={() => toggleRow(inf.id)} onOpen={() => setOpenId(inf.id)} onAdd={() => addOne(inf.id)} adding={addToPipeline.isPending} />
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
              <GridCard key={inf.id} inf={inf} selected={selected.has(inf.id)} onToggle={() => toggleRow(inf.id)} onOpen={() => setOpenId(inf.id)} onAdd={() => addOne(inf.id)} adding={addToPipeline.isPending} />
            ))}
          </div>
          <div className="glass mt-4 rounded-2xl">
            <Pagination page={page} pages={pages} total={total} isFetching={isFetching} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          </div>
        </div>
      )}

      <AddByUrlModal open={addOpen} onOpenChange={setAddOpen} />
      <InfluencerDrawer influencerId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function Row({ inf, selected, onToggle, onOpen, onAdd, adding }: {
  inf: Influencer; selected: boolean; onToggle: () => void; onOpen: () => void; onAdd: () => void; adding: boolean
}) {
  const ig = safeUrl(inf.profile_url)
  return (
    <tr className={cn('group border-b border-border/40 transition-colors hover:bg-muted/30', selected && 'bg-primary/5')}>
      <td className="px-4 py-2.5"><Checkbox checked={selected} onChange={onToggle} /></td>
      <td className="px-2 py-2.5">
        <button onClick={onOpen} className="flex items-center gap-3 text-left">
          <Avatar name={inf.name} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate font-medium group-hover:text-primary">{inf.name}</span>
              <VerifiedTick verified={inf.is_verified} />
            </div>
            <span className="text-xs text-muted-foreground">@{inf.handle}</span>
          </div>
        </button>
      </td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatFollowers(inf.follower_count)}</td>
      <td className="px-3 py-2.5"><NicheChip niche={inf.niche} /></td>
      <td className="px-3 py-2.5 text-xs uppercase text-muted-foreground">{inf.market || '—'}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {ig && <a href={ig} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground" title="Open on Instagram"><ExternalLink className="h-3.5 w-3.5" /></a>}
          {inf.in_pipeline
            ? <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-400">In Pipeline</span>
            : <Button size="sm" variant="ghost" onClick={onAdd} disabled={adding} className="border border-border"><Plus className="mr-1 h-3.5 w-3.5" /> Pipeline</Button>}
        </div>
      </td>
    </tr>
  )
}

function GridCard({ inf, selected, onToggle, onOpen, onAdd, adding }: {
  inf: Influencer; selected: boolean; onToggle: () => void; onOpen: () => void; onAdd: () => void; adding: boolean
}) {
  const ig = safeUrl(inf.profile_url)
  return (
    <div className={cn('glass-strong card-hover relative rounded-2xl p-4', selected && 'ring-1 ring-primary/40')}>
      <div className="absolute right-3 top-3"><Checkbox checked={selected} onChange={onToggle} /></div>
      <button onClick={onOpen} className="flex w-full flex-col items-center text-center">
        <Avatar name={inf.name} size={56} />
        <div className="mt-2 flex items-center gap-1">
          <span className="truncate font-semibold">{inf.name}</span>
          <VerifiedTick verified={inf.is_verified} />
        </div>
        <span className="text-xs text-muted-foreground">@{inf.handle}</span>
        <span className="mt-1 text-sm font-bold">{formatFollowers(inf.follower_count)}</span>
      </button>
      <div className="mt-2 flex justify-center"><NicheChip niche={inf.niche} /></div>
      <div className="mt-3 flex items-center gap-1.5">
        {ig && <a href={ig} target="_blank" rel="noreferrer noopener" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
        {inf.in_pipeline
          ? <span className="flex-1 rounded-md bg-emerald-500/15 py-1.5 text-center text-xs font-medium text-emerald-400">In Pipeline</span>
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

type SavedFilter = { search: string; niche: string; market: string; rangeKey: string; verifiedOnly: boolean; sort: string; order: 'asc' | 'desc' }
function SavedLists({ current, onApply, canSave }: { current: SavedFilter; onApply: (f: SavedFilter) => void; canSave: boolean }) {
  const { data } = useSegments()
  const addSeg = useAddSegment()
  const delSeg = useDeleteSegment()
  const lists = data?.segments ?? []
  const save = () => {
    const name = window.prompt('Name this list (e.g. "Tech 10K+")')
    if (!name?.trim()) return
    addSeg.mutate({ name: name.trim(), filters: current }, { onSuccess: () => toast.success('List saved') })
  }
  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-up">
      <span className="text-xs font-medium text-muted-foreground">Saved lists:</span>
      {lists.length === 0 && <span className="text-xs text-muted-foreground/70">none yet</span>}
      {lists.map(s => (
        <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-border bg-card/60 py-1 pl-3 pr-1 text-xs">
          <button onClick={() => { try { onApply(JSON.parse(s.filters)) } catch {} }} className="hover:text-primary">{s.name}</button>
          <button onClick={() => delSeg.mutate(s.id)} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {canSave && (
        <button onClick={save} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
          <Bookmark className="h-3 w-3" /> Save current view
        </button>
      )}
    </div>
  )
}
