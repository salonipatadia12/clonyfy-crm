'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, SlidersHorizontal, Download, ArrowUpDown, ArrowUp, ArrowDown,
  Check, BadgeCheck, X, Bookmark, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  useInfluencers, useFacets, useUpdateInfluencer, useSegments, useAddSegment, useDeleteSegment,
  type InfluencerFilters,
} from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TierBadge, NicheChip, VerifiedTick } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import {
  STAGES, STAGE_COLORS, ENG_STYLES, formatFollowers, nicheLabel, cn,
} from '@/lib/utils'
import type { Influencer } from '@/types/database'
import { toast } from 'sonner'

const PAGE_SIZE = 50
const TIERS = ['A', 'B', 'C']

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
  useEffect(() => { const o = params.get('open'); if (o) setOpenId(o) }, [params])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState<string[]>([])
  const [stage, setStage] = useState<string[]>([])
  const [niche, setNiche] = useState<string[]>([])
  const [market, setMarket] = useState<string[]>([])
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sort, setSort] = useState('follower_count')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const filters: InfluencerFilters = useMemo(() => ({
    search: search || undefined,
    tier: tier.length ? tier : undefined,
    stage: stage.length ? stage : undefined,
    niche: niche.length ? niche : undefined,
    market: market.length ? market : undefined,
    verifiedOnly: verifiedOnly || undefined,
    sort, order, page, pageSize: PAGE_SIZE,
  }), [search, tier, stage, niche, market, verifiedOnly, sort, order, page])

  const { data, isFetching } = useInfluencers(filters)
  const { data: facets } = useFacets()
  const updateInf = useUpdateInfluencer()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleArr = (arr: string[], set: (v: string[]) => void, v: string) => {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
    setPage(1)
  }
  const setSortCol = (col: string) => {
    if (sort === col) setOrder(o => (o === 'desc' ? 'asc' : 'desc'))
    else { setSort(col); setOrder('desc') }
    setPage(1)
  }

  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => {
    const next = new Set(selected)
    if (allOnPageSelected) rows.forEach(r => next.delete(r.id))
    else rows.forEach(r => next.add(r.id))
    setSelected(next)
  }
  const toggleRow = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const bulkMove = (toStage: string) => {
    const ids = [...selected]
    Promise.all(ids.map(id => updateInf.mutateAsync({ id, patch: { stage: toStage } })))
      .then(() => { toast.success(`Moved ${ids.length} to ${toStage}`); setSelected(new Set()) })
      .catch(() => toast.error('Bulk move failed'))
  }

  const exportCsv = () => {
    const toExport = selected.size ? rows.filter(r => selected.has(r.id)) : rows
    const cols = ['handle', 'name', 'follower_count', 'engagement_rate', 'quality_tier', 'niche', 'stage', 'email', 'profile_url']
    const head = cols.join(',')
    const body = toExport.map(r => cols.map(c => {
      const v = (r as any)[c] ?? ''
      const cell = String(v).replace(/"/g, '""')
      // Neutralize spreadsheet formula injection from scraped fields.
      const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
      return /[",\n]/.test(safe) ? `"${safe}"` : safe
    }).join(',')).join('\n')
    const blob = new Blob([head + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'clonyfy-influencers.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${toExport.length} rows`)
  }

  const resetFilters = () => {
    setSearchInput(''); setSearch(''); setTier([]); setStage([]); setNiche([]); setMarket([]); setVerifiedOnly(false); setPage(1)
  }
  const activeFilterCount = tier.length + stage.length + niche.length + market.length + (verifiedOnly ? 1 : 0) + (search ? 1 : 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Influencers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString()} creators{activeFilterCount > 0 ? ' matching filters' : ' in your database'}
          </p>
        </div>
        <Button variant="ghost" onClick={exportCsv} className="border border-border">
          <Download className="mr-1.5 h-4 w-4" /> Export {selected.size ? `(${selected.size})` : 'CSV'}
        </Button>
      </header>

      {/* Saved segments */}
      <SegmentBar
        current={{ search, tier, stage, niche, market, verifiedOnly }}
        onApply={(f) => {
          setSearchInput(f.search || ''); setSearch(f.search || '')
          setTier(f.tier || []); setStage(f.stage || []); setNiche(f.niche || []); setMarket(f.market || [])
          setVerifiedOnly(!!f.verifiedOnly); setPage(1)
        }}
      />

      {/* Toolbar */}
      <div className="glass space-y-3 rounded-2xl p-4 animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search handle, name, bio…" className="pl-9" />
          </div>
          <Select value={niche[0] ?? ''} onChange={(e) => setNiche(e.target.value ? [e.target.value] : [])} className="w-44">
            <option value="">All niches</option>
            {facets?.niche.map(n => <option key={n} value={n}>{nicheLabel(n)}</option>)}
          </Select>
          <Select value={stage[0] ?? ''} onChange={(e) => setStage(e.target.value ? [e.target.value] : [])} className="w-40">
            <option value="">All stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={market[0] ?? ''} onChange={(e) => setMarket(e.target.value ? [e.target.value] : [])} className="w-32">
            <option value="">All markets</option>
            {facets?.market.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" /> Tier</span>
          {TIERS.map(t => (
            <button key={t} onClick={() => toggleArr(tier, setTier, t)}
              className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                tier.includes(t) ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/60')}>
              Tier {t}
            </button>
          ))}
          <button onClick={() => { setVerifiedOnly(v => !v); setPage(1) }}
            className={cn('inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              verifiedOnly ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-border text-muted-foreground hover:bg-muted/60')}>
            <BadgeCheck className="h-3.5 w-3.5" /> Verified
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Clear ({activeFilterCount})
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort</span>
            <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} className="w-40">
              <option value="follower_count">Followers</option>
              <option value="engagement_rate">Engagement</option>
              <option value="avg_likes">Avg likes</option>
              <option value="name">Name</option>
              <option value="updated_at">Last updated</option>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')} className="border border-border">
              {order === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl border-primary/30 p-3 animate-fade-up">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Move to</span>
            <Select defaultValue="" onChange={(e) => e.target.value && bulkMove(e.target.value)} className="w-40">
              <option value="">Choose stage…</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={exportCsv} className="border border-border"><Download className="mr-1 h-4 w-4" /> Export</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <Checkbox checked={allOnPageSelected} onChange={toggleAll} />
                </th>
                <th className="px-2 py-3">Creator</th>
                <SortableTh label="Followers" col="follower_count" sort={sort} order={order} onSort={setSortCol} align="right" />
                <SortableTh label="Engagement" col="engagement_rate" sort={sort} order={order} onSort={setSortCol} />
                <th className="px-3 py-3 text-center">Tier</th>
                <th className="px-3 py-3">Niche</th>
                <th className="px-3 py-3">Stage</th>
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 12 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40"><td colSpan={7} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {rows.map(inf => (
                <Row
                  key={inf.id}
                  inf={inf}
                  selected={selected.has(inf.id)}
                  onToggle={() => toggleRow(inf.id)}
                  onOpen={() => setOpenId(inf.id)}
                  onStage={(s) => updateInf.mutate({ id: inf.id, patch: { stage: s } }, { onSuccess: () => toast.success(`Moved to ${s}`) })}
                />
              ))}
              {data && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">No creators match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total.toLocaleString()} creators {isFetching && <span className="ml-1 animate-pulse text-primary">·updating</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border border-border"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="border border-border"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <InfluencerDrawer influencerId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function Row({ inf, selected, onToggle, onOpen, onStage }: {
  inf: Influencer; selected: boolean; onToggle: () => void; onOpen: () => void; onStage: (s: string) => void
}) {
  const eng = inf.engagement_rate ?? 0
  const engPct = Math.min(eng, 40) / 40 * 100
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
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${engPct}%` }} />
          </div>
          <span className={cn('text-xs tabular-nums', ENG_STYLES[inf.eng_quality ?? ''] ?? 'text-muted-foreground')}>
            {inf.engagement_rate != null ? `${inf.engagement_rate}%` : '—'}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center"><TierBadge tier={inf.quality_tier} /></td>
      <td className="px-3 py-2.5"><NicheChip niche={inf.niche} /></td>
      <td className="px-3 py-2.5">
        <Select value={inf.stage} onChange={(e) => onStage(e.target.value)} onClick={(e) => e.stopPropagation()} className={cn('h-7 w-36 border-0 text-xs font-medium', STAGE_COLORS[inf.stage])}>
          {STAGES.map(s => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
        </Select>
      </td>
    </tr>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}

function SortableTh({ label, col, sort, order, onSort, align = 'left' }: {
  label: string; col: string; sort: string; order: 'asc' | 'desc'; onSort: (c: string) => void; align?: 'left' | 'right'
}) {
  const active = sort === col
  return (
    <th className={cn('px-3 py-3', align === 'right' && 'text-right')}>
      <button onClick={() => onSort(col)} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
        {label}
        {active ? (order === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

function SegmentBar({ current, onApply }: {
  current: { search: string; tier: string[]; stage: string[]; niche: string[]; market: string[]; verifiedOnly: boolean }
  onApply: (f: any) => void
}) {
  const { data } = useSegments()
  const addSeg = useAddSegment()
  const delSeg = useDeleteSegment()
  const save = () => {
    const name = window.prompt('Name this segment')
    if (!name?.trim()) return
    addSeg.mutate({ name: name.trim(), filters: current }, { onSuccess: () => toast.success('Segment saved') })
  }
  const segments = data?.segments ?? []
  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-up">
      <span className="text-xs font-medium text-muted-foreground">Segments:</span>
      {segments.length === 0 && <span className="text-xs text-muted-foreground/70">none yet</span>}
      {segments.map(s => (
        <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-border bg-card/60 py-1 pl-3 pr-1 text-xs">
          <button onClick={() => { try { onApply(JSON.parse(s.filters)) } catch {} }} className="hover:text-primary">{s.name}</button>
          <button onClick={() => delSeg.mutate(s.id)} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <button onClick={save} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
        <Bookmark className="h-3 w-3" /> Save current
      </button>
    </div>
  )
}
