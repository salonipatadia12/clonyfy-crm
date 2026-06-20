'use client'

import { useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCorners, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { usePipeline, useUpdatePipeline, useReassign, useMembers, useRemoveFromPipeline, useCampaigns } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VerifiedTick } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { CloseDealPrompt, type CloseTarget } from '@/components/crm/close-deal-prompt'
import { STAGES, STAGE_HEX, STAGE_COLORS, ADVANCED_STAGES, stageLabel, formatFollowers, nicheLabel, safeUrl, cn, downloadCsv } from '@/lib/utils'
import type { PipelineRow, Stage } from '@/types/database'
import { Search, ExternalLink, LayoutGrid, List, Clock, Check, UserCog, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'

const COLUMN_CAP = 60
const STALE_DAYS = 7
const STALE_STAGES: Stage[] = ['contacted', 'responded', 'negotiating']

function isStale(r: PipelineRow): boolean {
  if (!STALE_STAGES.includes(r.stage) || !r.last_touch) return false
  return Date.now() - new Date(r.last_touch).getTime() > STALE_DAYS * 864e5
}

export function PipelineBoard() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-2xl" />}><PipelineBoardInner /></Suspense>
}

function PipelineBoardInner() {
  const params = useSearchParams()
  // Cross-screen nav (spec §13): /pipeline?stage=&country=&assignedTo= filter server-side.
  const urlFilters = {
    stage: (params.get('stage') as Stage) || undefined,
    country: params.get('country') || undefined,
    assignedTo: params.get('assignedTo') || undefined,
  }
  const { data, isLoading } = usePipeline(urlFilters)
  const updatePipe = useUpdatePipeline()
  const reassign = useReassign()
  const removePipe = useRemoveFromPipeline()
  const { data: membersData } = useMembers()
  const members = membersData?.members ?? []
  const { data: campData } = useCampaigns()
  const campaigns = campData?.campaigns ?? []
  const isAdmin = useIsAdmin()
  const [overrides, setOverrides] = useState<Record<string, Stage>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openHandle, setOpenHandle] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState<Stage | ''>('')
  const [bulkMember, setBulkMember] = useState('')
  const [bulkCampaign, setBulkCampaign] = useState('')
  // Optimistic owner overrides so reassignment reflects instantly (#11).
  const [assignOverrides, setAssignOverrides] = useState<Record<string, { assigned_to: string; assigned_name: string }>>({})
  // Queue of just-closed creators awaiting a deal — surfaced one at a time so a
  // batch of closes never slips ("create the deal now" prompt).
  const [closeQueue, setCloseQueue] = useState<CloseTarget[]>([])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Enqueue rows that just moved into "Closed" (skip ones already there).
  const enqueueClose = (ids: string[]) => {
    const targets = ids
      .map(id => allRows.find(r => r.id === id))
      .filter((r): r is PipelineRow => !!r && r.stage !== 'closed')
      .map(r => ({ pipelineId: r.id, handle: r.handle, fullName: r.full_name }))
    if (targets.length) setCloseQueue(q => [...q, ...targets])
  }

  // Apply optimistic owner overrides on top of the fetched rows.
  const allRows = (data?.rows ?? []).map(r => {
    const ov = assignOverrides[r.id]
    return ov ? { ...r, assigned_to: ov.assigned_to, assigned_name: ov.assigned_name } : r
  })
  const rows = allRows.filter(r =>
    (!search || r.full_name?.toLowerCase().includes(search.toLowerCase()) || r.handle.toLowerCase().includes(search.toLowerCase())) &&
    (!niche || r.niche === niche) &&
    (!memberFilter || r.assigned_to === memberFilter) &&
    (!campaignFilter || r.campaign_id === campaignFilter)
  )
  const niches = Array.from(new Set(allRows.map(r => r.niche).filter(Boolean))) as string[]

  // Per-member progress (admin): in-pipeline + advanced counts (#11).
  const teamProgress = isAdmin ? members.map(m => {
    const mine = allRows.filter(r => r.assigned_to === m.id)
    return { id: m.id, name: m.name, total: mine.length, advanced: mine.filter(r => ADVANCED_STAGES.includes(r.stage)).length }
  }).filter(t => t.total > 0).sort((a, b) => b.total - a.total) : []

  const stageOf = (r: PipelineRow): Stage => overrides[r.id] ?? r.stage
  const grouped = useMemo(() => {
    const g: Record<string, PipelineRow[]> = Object.fromEntries(STAGES.map(s => [s, []]))
    for (const r of rows) g[stageOf(r)]?.push(r)
    return g
  }, [rows, overrides])

  const active = activeId ? rows.find(r => r.id === activeId) ?? null : null
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const to = e.over?.id as Stage | undefined
    if (!to || !STAGES.includes(to)) return
    const row = rows.find(r => r.id === id)
    if (!row || stageOf(row) === to) return
    const wasClosed = stageOf(row) === 'closed'
    setOverrides(o => ({ ...o, [id]: to }))
    updatePipe.mutate({ id, patch: { stage: to } }, {
      onSuccess: () => { toast.success(`${row.full_name || row.handle} → ${stageLabel(to)}`); if (to === 'closed' && !wasClosed) enqueueClose([id]) },
      onError: () => { setOverrides(o => { const n = { ...o }; delete n[id]; return n }); toast.error('Move failed') },
    })
  }

  const toggleSel = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const applyBulkStage = async () => {
    if (!bulkStage) return
    const ids = [...selected]
    const closing = bulkStage === 'closed' ? ids : []
    await Promise.all(ids.map(id => updatePipe.mutateAsync({ id, patch: { stage: bulkStage } }).catch(() => null)))
    toast.success(`Moved ${ids.length} to ${stageLabel(bulkStage)}`); setSelected(new Set()); setBulkStage('')
    if (closing.length) enqueueClose(closing)
  }
  const applyBulkReassign = async () => {
    if (!bulkMember) return
    const ids = [...selected]
    const member = members.find(m => m.id === bulkMember)
    // Optimistically reflect the new owner so the board updates instantly (#11).
    if (member) setAssignOverrides(o => { const n = { ...o }; ids.forEach(id => { n[id] = { assigned_to: member.id, assigned_name: member.name } }); return n })
    await Promise.all(ids.map(id => reassign.mutateAsync({ id, toUserId: bulkMember }).catch(() => null)))
    toast.success(`Reassigned ${ids.length}${member ? ` to ${member.name}` : ''}`); setSelected(new Set()); setBulkMember('')
  }
  const applyBulkRemove = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Remove ${ids.length} creator${ids.length > 1 ? 's' : ''} from the pipeline?`)) return
    await Promise.all(ids.map(id => removePipe.mutateAsync(id).catch(() => null)))
    toast.success(`Removed ${ids.length} from pipeline`); setSelected(new Set())
  }
  const applyBulkCampaign = async () => {
    const ids = [...selected]
    if (!ids.length || !bulkCampaign) return
    const cid = bulkCampaign === '__none__' ? null : bulkCampaign
    await Promise.all(ids.map(id => updatePipe.mutateAsync({ id, patch: { campaign_id: cid } }).catch(() => null)))
    toast.success(`Tagged ${ids.length}`); setSelected(new Set()); setBulkCampaign('')
  }
  const exportSelected = () => {
    const picked = (selected.size ? rows.filter(r => selected.has(r.id)) : rows).map(r => ({ ...r, stage: stageLabel(stageOf(r)) }))
    downloadCsv('clonyfy-pipeline.csv', picked as unknown as Record<string, unknown>[], [
      { key: 'handle', label: 'handle' }, { key: 'full_name', label: 'name' },
      { key: 'stage', label: 'stage' }, { key: 'assigned_name', label: 'owner' },
      { key: 'follower_count', label: 'followers' }, { key: 'niche', label: 'niche' },
      { key: 'country', label: 'country' }, { key: 'last_touch', label: 'last_touch' },
    ])
    toast.success(`Exported ${picked.length} row${picked.length > 1 ? 's' : ''}`)
  }

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-4 pr-2">
          <div><p className="text-xs text-muted-foreground">{isAdmin ? 'Team pipeline' : 'In pipeline'}</p><p className="text-lg font-bold">{allRows.length.toLocaleString()}</p></div>
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pipeline…" className="pl-9" />
        </div>
        <Select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-40">
          <option value="">All niches</option>
          {niches.map(n => <option key={n} value={n}>{nicheLabel(n)}</option>)}
        </Select>
        {isAdmin && (
          <Select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="w-44">
            <option value="">All members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        )}
        {campaigns.length > 0 && (
          <Select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="w-44">
            <option value="">All campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button onClick={() => setView('board')} className={cn('px-2 py-1.5', view === 'board' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} className={cn('px-2 py-1.5', view === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60')}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Team progress (admin) — per-member pipeline + advanced counts; click to filter (#11) */}
      {teamProgress.length > 0 && (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Team progress:</span>
          {teamProgress.map(t => (
            <button key={t.id} onClick={() => setMemberFilter(memberFilter === t.id ? '' : t.id)}
              className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors',
                memberFilter === t.id ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border bg-card/60 text-muted-foreground hover:border-primary/30')}>
              <span className="font-medium text-foreground">{t.name}</span>
              <span className="rounded-full bg-muted px-1.5 tabular-nums">{t.total}</span>
              <span className="text-emerald-400 tabular-nums" title="advanced past contacted">{t.advanced} adv</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">{STAGES.map(s => <Skeleton key={s} className="h-[60vh] w-80 shrink-0 rounded-2xl" />)}</div>
      ) : allRows.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-2xl py-20 text-center">
          <p className="text-sm font-medium">Your pipeline is empty</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Go to Influencers and use <span className="text-foreground">+ Pipeline</span> to start working creators here.</p>
        </div>
      ) : view === 'board' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => <Column key={stage} stage={stage} items={grouped[stage]} onOpen={setOpenHandle} isAdmin={isAdmin} />)}
          </div>
          <DragOverlay>{active ? <Card row={active} dragging isAdmin={isAdmin} /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {selected.size > 0 && (
            <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl border-primary/30 p-3">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Select value={bulkStage} onChange={(e) => setBulkStage(e.target.value as Stage)} className="h-9 w-40">
                  <option value="">Move to stage…</option>
                  {STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
                </Select>
                <Button size="sm" onClick={applyBulkStage} disabled={!bulkStage || updatePipe.isPending}>Apply</Button>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <Select value={bulkMember} onChange={(e) => setBulkMember(e.target.value)} className="h-9 w-44">
                    <option value="">Reassign to…</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" className="border border-border" onClick={applyBulkReassign} disabled={!bulkMember || reassign.isPending}><UserCog className="mr-1 h-4 w-4" /> Reassign</Button>
                </div>
              )}
              {campaigns.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select value={bulkCampaign} onChange={(e) => setBulkCampaign(e.target.value)} className="h-9 w-44">
                    <option value="">Set campaign…</option>
                    <option value="__none__">— Remove from campaign —</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Button size="sm" className="border border-border" onClick={applyBulkCampaign} disabled={!bulkCampaign || updatePipe.isPending}>Tag</Button>
                </div>
              )}
              <Button size="sm" variant="ghost" className="border border-border" onClick={exportSelected}><Download className="mr-1 h-4 w-4" /> Export</Button>
              <Button size="sm" variant="ghost" className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10" onClick={applyBulkRemove} disabled={removePipe.isPending}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          <ListView rows={rows} isAdmin={isAdmin} selected={selected} onToggle={toggleSel} onOpen={setOpenHandle} onStage={(id, s) => {
            const wasClosed = (allRows.find(r => r.id === id)?.stage) === 'closed'
            setOverrides(o => ({ ...o, [id]: s }))
            updatePipe.mutate({ id, patch: { stage: s } }, { onSuccess: () => { toast.success(`Moved to ${stageLabel(s)}`); if (s === 'closed' && !wasClosed) enqueueClose([id]) } })
          }} />
        </div>
      )}

      <InfluencerDrawer influencerId={openHandle} onOpenChange={(o) => !o && setOpenHandle(null)} />

      <CloseDealPrompt target={closeQueue[0] ?? null} onOpenChange={(o) => { if (!o) setCloseQueue(q => q.slice(1)) }} />
    </div>
  )
}

function Column({ stage, items, onOpen, isAdmin }: { stage: Stage; items: PipelineRow[]; onOpen: (h: string) => void; isAdmin: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const reach = items.reduce((a, i) => a + (i.follower_count || 0), 0)
  const shown = items.slice(0, COLUMN_CAP)
  return (
    <div className="flex w-80 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_HEX[stage] }} />
          <span className="text-sm font-semibold">{stageLabel(stage)}</span>
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{items.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatFollowers(reach)}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex-1 space-y-2 rounded-2xl border border-dashed p-2 transition-colors min-h-[55vh]', isOver ? 'border-primary/60 bg-primary/5' : 'border-border/40')}>
        {shown.map(row => <DraggableCard key={row.id} row={row} onOpen={onOpen} isAdmin={isAdmin} />)}
        {items.length > COLUMN_CAP && <p className="py-2 text-center text-xs text-muted-foreground">+{items.length - COLUMN_CAP} more</p>}
        {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground/60">Drop here</p>}
      </div>
    </div>
  )
}

function DraggableCard({ row, onOpen, isAdmin }: { row: PipelineRow; onOpen: (h: string) => void; isAdmin: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Card row={row} onOpen={() => onOpen(row.handle)} isAdmin={isAdmin} />
    </div>
  )
}

function Card({ row, dragging, onOpen, isAdmin }: { row: PipelineRow; dragging?: boolean; onOpen?: () => void; isAdmin: boolean }) {
  const ig = safeUrl(row.profile_url)
  const stale = isStale(row)
  return (
    <div className={cn('cursor-grab rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-primary/40', dragging && 'rotate-2 cursor-grabbing border-primary/60 shadow-2xl shadow-primary/30')}>
      <div className="flex items-center gap-2.5">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar name={row.full_name || row.handle} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1"><p className="truncate text-sm font-medium">{row.full_name || row.handle}</p><VerifiedTick verified={row.is_verified} /></div>
            <p className="truncate text-xs text-muted-foreground">@{row.handle}</p>
          </div>
        </button>
        {stale && <span title={`No touch in ${STALE_DAYS}+ days`}><Clock className="h-3.5 w-3.5 text-amber-400" /></span>}
        {ig && <a href={ig} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{formatFollowers(row.follower_count)}</span>
        <div className="flex items-center gap-1.5">
          {isAdmin && row.assigned_name && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-medium text-violet-300">{row.assigned_name.split(' ')[0]}</span>}
          {row.niche && <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">{nicheLabel(row.niche)}</span>}
        </div>
      </div>
    </div>
  )
}

function ListView({ rows, isAdmin, selected, onToggle, onOpen, onStage }: { rows: PipelineRow[]; isAdmin: boolean; selected: Set<string>; onToggle: (id: string) => void; onOpen: (h: string) => void; onStage: (id: string, s: Stage) => void }) {
  const allSel = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => rows.forEach(r => { if (allSel) { if (selected.has(r.id)) onToggle(r.id) } else if (!selected.has(r.id)) onToggle(r.id) })
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-4 py-3"><SelBox checked={allSel} onChange={toggleAll} /></th>
              <th className="px-2 py-3">Creator</th>
              <th className="px-3 py-3 text-right">Followers</th>
              {isAdmin && <th className="px-3 py-3">Assigned</th>}
              <th className="px-3 py-3">Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={cn('border-b border-border/40 hover:bg-muted/30', selected.has(row.id) && 'bg-primary/5')}>
                <td className="px-4 py-2.5"><SelBox checked={selected.has(row.id)} onChange={() => onToggle(row.id)} /></td>
                <td className="px-2 py-2.5">
                  <button onClick={() => onOpen(row.handle)} className="flex items-center gap-3 text-left">
                    <Avatar name={row.full_name || row.handle} size={34} />
                    <div className="min-w-0"><div className="flex items-center gap-1"><span className="truncate font-medium">{row.full_name || row.handle}</span><VerifiedTick verified={row.is_verified} />{isStale(row) && <Clock className="h-3.5 w-3.5 text-amber-400" />}</div><span className="text-xs text-muted-foreground">@{row.handle}</span></div>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatFollowers(row.follower_count)}</td>
                {isAdmin && <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.assigned_name || '—'}</td>}
                <td className="px-3 py-2.5">
                  <Select value={row.stage} onChange={(e) => onStage(row.id, e.target.value as Stage)} className={cn('h-7 w-36 border-0 text-xs font-medium', STAGE_COLORS[row.stage])}>
                    {STAGES.map(s => <option key={s} value={s} className="bg-card text-foreground">{stageLabel(s)}</option>)}
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

function SelBox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange() }}
      className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}
