'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCorners, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useInfluencers, useUpdateInfluencer, useDeals } from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VerifiedTick } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { NewDealModal } from '@/components/crm/new-deal-modal'
import { STAGES, STAGE_HEX, STAGE_COLORS, formatFollowers, formatMoney, nicheLabel, safeUrl, cn } from '@/lib/utils'
import type { Influencer, Stage } from '@/types/database'
import { Search, ExternalLink, Plus, LayoutGrid, List } from 'lucide-react'
import { toast } from 'sonner'

const COLUMN_CAP = 60

export function PipelineBoard() {
  const { data, isLoading } = useInfluencers({ inPipeline: true, sort: 'updated_at', order: 'desc', pageSize: 500 })
  const { data: dealData } = useDeals()
  const updateInf = useUpdateInfluencer()
  const [overrides, setOverrides] = useState<Record<string, Stage>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState('')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [dealOpen, setDealOpen] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Sum deal values per creator for the card badge + summary bar.
  const dealByInf = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of dealData?.deals ?? []) {
      if (d.deal_value) m.set(d.influencer_id, (m.get(d.influencer_id) ?? 0) + d.deal_value)
    }
    return m
  }, [dealData])

  const allRows = data?.rows ?? []
  const rows = allRows.filter(r =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.handle.toLowerCase().includes(search.toLowerCase())) &&
    (!niche || r.niche === niche)
  )
  const niches = Array.from(new Set(allRows.map(r => r.niche).filter(Boolean))) as string[]
  const totalValue = allRows.reduce((a, r) => a + (dealByInf.get(r.id) ?? 0), 0)

  const stageOf = (inf: Influencer): Stage => overrides[inf.id] ?? inf.stage
  const grouped = useMemo(() => {
    const g: Record<string, Influencer[]> = Object.fromEntries(STAGES.map(s => [s, []]))
    for (const inf of rows) g[stageOf(inf)]?.push(inf)
    return g
  }, [rows, overrides])

  const active = activeId ? rows.find(r => r.id === activeId) ?? null : null
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const to = e.over?.id as Stage | undefined
    if (!to || !STAGES.includes(to)) return
    const inf = rows.find(r => r.id === id)
    if (!inf || stageOf(inf) === to) return
    setOverrides(o => ({ ...o, [id]: to }))
    updateInf.mutate({ id, patch: { stage: to } }, {
      onSuccess: () => toast.success(`${inf.name} → ${to}`),
      onError: () => { setOverrides(o => { const n = { ...o }; delete n[id]; return n }); toast.error('Move failed') },
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary + toolbar */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-4 pr-2">
          <div><p className="text-xs text-muted-foreground">In pipeline</p><p className="text-lg font-bold">{allRows.length.toLocaleString()}</p></div>
          <div className="h-8 w-px bg-border" />
          <div><p className="text-xs text-muted-foreground">Total deal value</p><p className="text-lg font-bold text-emerald-400">{formatMoney(totalValue)}</p></div>
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pipeline…" className="pl-9" />
        </div>
        <Select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-40">
          <option value="">All niches</option>
          {niches.map(n => <option key={n} value={n}>{nicheLabel(n)}</option>)}
        </Select>
        <div className="flex overflow-hidden rounded-md border border-border">
          <button onClick={() => setView('board')} className={cn('px-2 py-1.5', view === 'board' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} className={cn('px-2 py-1.5', view === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><List className="h-4 w-4" /></button>
        </div>
        <Button onClick={() => setDealOpen(true)}><Plus className="mr-1 h-4 w-4" /> New deal</Button>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">{STAGES.map(s => <Skeleton key={s} className="h-[60vh] w-80 shrink-0 rounded-2xl" />)}</div>
      ) : allRows.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-2xl py-20 text-center">
          <p className="text-sm font-medium">Your pipeline is empty</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Go to Influencers and use <span className="text-foreground">+ Add to Pipeline</span> to start working creators here.</p>
        </div>
      ) : view === 'board' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => <Column key={stage} stage={stage} items={grouped[stage]} dealByInf={dealByInf} onOpen={setOpenId} />)}
          </div>
          <DragOverlay>{active ? <Card inf={active} value={dealByInf.get(active.id)} dragging /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <ListView rows={rows} dealByInf={dealByInf} onOpen={setOpenId} onStage={(id, s) => {
          setOverrides(o => ({ ...o, [id]: s }))
          updateInf.mutate({ id, patch: { stage: s } }, { onSuccess: () => toast.success(`Moved to ${s}`) })
        }} />
      )}

      <NewDealModal open={dealOpen} onOpenChange={setDealOpen} />
      <InfluencerDrawer influencerId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function Column({ stage, items, dealByInf, onOpen }: { stage: Stage; items: Influencer[]; dealByInf: Map<string, number>; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const reach = items.reduce((a, i) => a + (i.follower_count || 0), 0)
  const shown = items.slice(0, COLUMN_CAP)
  return (
    <div className="flex w-80 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_HEX[stage] }} />
          <span className="text-sm font-semibold">{stage}</span>
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{items.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatFollowers(reach)}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex-1 space-y-2 rounded-2xl border border-dashed p-2 transition-colors min-h-[55vh]', isOver ? 'border-primary/60 bg-primary/5' : 'border-border/40')}>
        {shown.map(inf => <DraggableCard key={inf.id} inf={inf} value={dealByInf.get(inf.id)} onOpen={onOpen} />)}
        {items.length > COLUMN_CAP && <p className="py-2 text-center text-xs text-muted-foreground">+{items.length - COLUMN_CAP} more</p>}
        {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground/60">Drop here</p>}
      </div>
    </div>
  )
}

function DraggableCard({ inf, value, onOpen }: { inf: Influencer; value?: number; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: inf.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Card inf={inf} value={value} onOpen={() => onOpen(inf.id)} />
    </div>
  )
}

function Card({ inf, value, dragging, onOpen }: { inf: Influencer; value?: number; dragging?: boolean; onOpen?: () => void }) {
  const ig = safeUrl(inf.profile_url)
  return (
    <div className={cn('cursor-grab rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-primary/40', dragging && 'rotate-2 cursor-grabbing border-primary/60 shadow-2xl shadow-primary/30')}>
      <div className="flex items-center gap-2.5">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar name={inf.name} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1"><p className="truncate text-sm font-medium">{inf.name}</p><VerifiedTick verified={inf.is_verified} /></div>
            <p className="truncate text-xs text-muted-foreground">@{inf.handle}</p>
          </div>
        </button>
        {ig && <a href={ig} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{formatFollowers(inf.follower_count)}</span>
        {value ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-400">{formatMoney(value)}</span> : <span className="text-muted-foreground">no deal</span>}
      </div>
    </div>
  )
}

function ListView({ rows, dealByInf, onOpen, onStage }: { rows: Influencer[]; dealByInf: Map<string, number>; onOpen: (id: string) => void; onStage: (id: string, s: Stage) => void }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Creator</th>
              <th className="px-3 py-3 text-right">Followers</th>
              <th className="px-3 py-3 text-right">Deal value</th>
              <th className="px-3 py-3">Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(inf => (
              <tr key={inf.id} className="border-b border-border/40 hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <button onClick={() => onOpen(inf.id)} className="flex items-center gap-3 text-left">
                    <Avatar name={inf.name} size={34} />
                    <div className="min-w-0"><div className="flex items-center gap-1"><span className="truncate font-medium">{inf.name}</span><VerifiedTick verified={inf.is_verified} /></div><span className="text-xs text-muted-foreground">@{inf.handle}</span></div>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatFollowers(inf.follower_count)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{dealByInf.get(inf.id) ? formatMoney(dealByInf.get(inf.id)) : '—'}</td>
                <td className="px-3 py-2.5">
                  <Select value={inf.stage} onChange={(e) => onStage(inf.id, e.target.value as Stage)} className={cn('h-7 w-36 border-0 text-xs font-medium', STAGE_COLORS[inf.stage])}>
                    {STAGES.map(s => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
