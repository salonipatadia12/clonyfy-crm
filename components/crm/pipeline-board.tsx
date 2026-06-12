'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCorners, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useInfluencers, useUpdateInfluencer } from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { TierBadge, VerifiedTick } from '@/components/crm/badges'
import { InfluencerDrawer } from '@/components/crm/influencer-drawer'
import { STAGES, STAGE_HEX, formatFollowers, cn } from '@/lib/utils'
import type { Influencer, Stage } from '@/types/database'
import { toast } from 'sonner'

const COLUMN_CAP = 60

export function PipelineBoard() {
  // Recently-touched first so the board surfaces active work; capped for perf.
  const { data, isLoading } = useInfluencers({ sort: 'updated_at', order: 'desc', pageSize: 400 })
  const updateInf = useUpdateInfluencer()
  const [overrides, setOverrides] = useState<Record<string, Stage>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const rows = data?.rows ?? []
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

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(s => <Skeleton key={s} className="h-[60vh] w-80 shrink-0 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => (
            <Column key={stage} stage={stage} items={grouped[stage]} onOpen={setOpenId} />
          ))}
        </div>
        <DragOverlay>{active ? <Card inf={active} dragging /> : null}</DragOverlay>
      </DndContext>
      <InfluencerDrawer influencerId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  )
}

function Column({ stage, items, onOpen }: { stage: Stage; items: Influencer[]; onOpen: (id: string) => void }) {
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
      <div
        ref={setNodeRef}
        className={cn('flex-1 space-y-2 rounded-2xl border border-dashed p-2 transition-colors min-h-[55vh]',
          isOver ? 'border-primary/60 bg-primary/5' : 'border-border/40')}
      >
        {shown.map(inf => <DraggableCard key={inf.id} inf={inf} onOpen={onOpen} />)}
        {items.length > COLUMN_CAP && (
          <p className="py-2 text-center text-xs text-muted-foreground">+{items.length - COLUMN_CAP} more</p>
        )}
        {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground/60">Drop here</p>}
      </div>
    </div>
  )
}

function DraggableCard({ inf, onOpen }: { inf: Influencer; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: inf.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Card inf={inf} onClick={() => onOpen(inf.id)} />
    </div>
  )
}

function Card({ inf, dragging, onClick }: { inf: Influencer; dragging?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('cursor-grab rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-primary/40',
        dragging && 'rotate-2 cursor-grabbing border-primary/60 shadow-2xl shadow-primary/30')}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={inf.name} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-sm font-medium">{inf.name}</p>
            <VerifiedTick verified={inf.is_verified} />
          </div>
          <p className="truncate text-xs text-muted-foreground">@{inf.handle}</p>
        </div>
        <TierBadge tier={inf.quality_tier} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{formatFollowers(inf.follower_count)}</span>
        {inf.engagement_rate != null && <span className="text-emerald-400">{inf.engagement_rate}%</span>}
      </div>
    </div>
  )
}
