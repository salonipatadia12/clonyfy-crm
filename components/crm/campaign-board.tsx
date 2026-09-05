'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, LayoutGrid, List, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { MembershipEditor } from '@/components/crm/membership-editor'

import { Table, TableScroll, THead, TH, TR, TD, Checkbox } from '@/components/ui/table'
import { GeoBadge, ContactBadge, Followers, CreatorIdentity, NicheChip } from '@/components/crm/creator-badges'
import { useUpdateCampaignCreator, useBulkUpdateCampaignCreators, useRemoveCampaignCreator } from '@/lib/queries'
import { CC_STAGES, CC_STAGE_LABELS, ccStageLabel, dueLabel } from '@/lib/domain'
import { cn, nicheLabel, toggleIn } from '@/lib/utils'
import type { CampaignCreator } from '@/types/campaign'

export function CampaignBoard({
  creators, members,
}: {
  creators: CampaignCreator[]
  members: { id: string; name: string }[]
}) {
  const [view, setView] = useState<'board' | 'list'>('board')
  const [editing, setEditing] = useState<CampaignCreator | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const update = useUpdateCampaignCreator()
  const bulk = useBulkUpdateCampaignCreators()
  const remove = useRemoveCampaignCreator()

  const byStage = useMemo(() => {
    const m = new Map<string, CampaignCreator[]>()
    for (const s of CC_STAGES) m.set(s, [])
    for (const c of creators) {
      const list = m.get(c.stage)
      if (list) list.push(c)
      else m.set(c.stage, [c])
    }
    return m
  }, [creators])

  const move = (id: string, stage: string) => {
    // Moving here changes ONE row in campaign_creators. The same creator's
    // stage in every other campaign is a different row and is untouched.
    update.mutate({ id, patch: { stage } }, {
      onSuccess: () => toast.success(`Moved to ${ccStageLabel(stage)}.`),
      onError: e => toast.error(e.message),
    })
  }

  if (!creators.length) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Board view">
          <Button variant={view === 'board' ? 'default' : 'outline'} size="sm" onClick={() => setView('board')}>
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Board
          </Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
            <List className="h-3.5 w-3.5" aria-hidden /> List
          </Button>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{selected.size} selected</span>
            <Select
              aria-label="Move selected to stage"
              value=""
              containerClassName="w-44"
              onChange={e => {
                if (!e.target.value) return
                bulk.mutate({ ids: [...selected], stage: e.target.value }, {
                  onSuccess: r => { toast.success(`${r.updated} moved.`); setSelected(new Set()) },
                  onError: err => toast.error(err.message),
                })
              }}
            >
              <option value="">Move to stage…</option>
              {CC_STAGES.map(s => <option key={s} value={s}>{CC_STAGE_LABELS[s]}</option>)}
            </Select>
            <Select
              aria-label="Assign selected to owner"
              value=""
              containerClassName="w-40"
              onChange={e => {
                if (!e.target.value) return
                bulk.mutate({ ids: [...selected], owner_id: e.target.value === '__none' ? null : e.target.value }, {
                  onSuccess: r => { toast.success(`${r.updated} reassigned.`); setSelected(new Set()) },
                  onError: err => toast.error(err.message),
                })
              }}
            >
              <option value="">Assign owner…</option>
              <option value="__none">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {view === 'board'
        ? <Board byStage={byStage} onMove={move} onOpen={setEditing} />
        : (
          <ListView
            creators={creators}
            members={members}
            selected={selected}
            setSelected={setSelected}
            onMove={move}
            onOpen={setEditing}
            onRemove={id => {
              if (!confirm('Remove this creator from this campaign? Their other campaigns are unaffected.')) return
              remove.mutate(id, { onSuccess: () => toast.success('Removed from this campaign.'), onError: e => toast.error(e.message) })
            }}
            onAssign={(id, ownerId) => update.mutate({ id, patch: { owner_id: ownerId } }, { onError: e => toast.error(e.message) })}
          />
        )}

      {/* Everything stored about one influencer in this campaign. */}
      <MembershipEditor row={editing} open={!!editing} onOpenChange={o => { if (!o) setEditing(null) }} />
    </div>
  )
}

/* ------------------------------------------------------------------ board */

function Board({ byStage, onMove, onOpen }: {
  byStage: Map<string, CampaignCreator[]>
  onMove: (id: string, stage: string) => void
  onOpen: (cc: CampaignCreator) => void
}) {
  const [dragging, setDragging] = useState<CampaignCreator | null>(null)
  // A pointer must travel 6px before a drag starts, so a tap still opens a card
  // on touch devices instead of being swallowed by the drag sensor.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { row: CampaignCreator }).row)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const stage = e.over?.id
    const row = (e.active.data.current as { row: CampaignCreator } | undefined)?.row
    if (stage && row && row.stage !== stage) onMove(row.id, String(stage))
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {/* Horizontal scroll with a visible edge; on small screens the List view
          is the recommended path and is one tap away. */}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div className="flex w-max gap-3">
          {CC_STAGES.map(stage => (
            <Column key={stage} stage={stage} rows={byStage.get(stage) ?? []} onMove={onMove} onOpen={onOpen} />
          ))}
        </div>
      </div>
      <p className="text-2xs text-muted-foreground md:hidden">
        Scroll sideways to see every stage, or switch to List view to change stages with a dropdown.
      </p>
      <DragOverlay>{dragging && <CardBody row={dragging} dragging />}</DragOverlay>
    </DndContext>
  )
}

function Column({ stage, rows, onMove, onOpen }: {
  stage: string; rows: CampaignCreator[]
  onMove: (id: string, stage: string) => void
  onOpen: (cc: CampaignCreator) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <section
      ref={setNodeRef}
      aria-label={`${ccStageLabel(stage)} — ${rows.length} creators`}
      className={cn(
        'flex w-[260px] shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <h3 className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{ccStageLabel(stage)}</h3>
        <span className="rounded-sm bg-card px-1.5 py-0.5 text-2xs tnum">{rows.length}</span>
      </header>
      <div className="flex min-h-[80px] flex-col gap-2 p-2 pt-0">
        {rows.length === 0
          ? <p className="px-1 py-3 text-2xs text-muted-foreground">Nothing here.</p>
          : rows.map(r => <Card key={r.id} row={r} onMove={onMove} onOpen={onOpen} />)}
      </div>
    </section>
  )
}

function Card({ row, onMove, onOpen }: {
  row: CampaignCreator
  onMove: (id: string, stage: string) => void
  onOpen: (cc: CampaignCreator) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id, data: { row } })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('rounded-lg border border-border bg-card', isDragging && 'opacity-40')}
    >
      <div className="flex items-start gap-1 p-2">
        {/* The drag handle is separate so the card itself stays clickable and
            keyboard-reachable; every status change is also possible below. */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab rounded-sm p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          aria-label={`Drag ${row.handle}`}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          onClick={() => onOpen(row)}
          aria-label={`Open ${row.handle}`}
          className="min-w-0 flex-1 text-left"
        >
          <CardBody row={row} />
        </button>
      </div>
      {/* Accessibility + mobile: dragging is never the only way to move a card. */}
      <div className="border-t border-border p-1.5">
        <Select
          aria-label={`Stage for ${row.handle}`}
          className="h-7 text-2xs"
          value={row.stage}
          onChange={e => onMove(row.id, e.target.value)}
        >
          {CC_STAGES.map(s => <option key={s} value={s}>{CC_STAGE_LABELS[s]}</option>)}
        </Select>
      </div>
    </div>
  )
}

/**
 * What you need to see about someone at a glance: who they are, how big their
 * audience is, how you can reach them, and whether they need chasing.
 *
 * Deliberately not shown: the fit score (it read "0% fit" on every card once a
 * geography rule zeroed it, which told the user nothing), the match-reason
 * sentence, and the offer and deliverable badges — those live on their own tabs.
 */
function CardBody({ row, dragging }: { row: CampaignCreator; dragging?: boolean }) {
  const due = dueLabel(row.next_follow_up)
  return (
    <div className={cn('space-y-1.5', dragging && 'w-[240px] rounded-lg border border-primary bg-card p-2 shadow-lg')}>
      <CreatorIdentity handle={row.handle} fullName={row.full_name} platform={row.platform} />
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-2xs text-muted-foreground"><Followers count={row.follower_count} /></span>
        {row.niche && <Badge tone="outline">{nicheLabel(row.niche)}</Badge>}
      </div>
      <div className="flex flex-wrap gap-1">
        <ContactBadge
          contactStatus={row.contact_status} email={row.email} phone={row.phone}
          profileUrl={row.profile_url} verification={row.verification_status}
        />
      </div>
      {(due || row.last_contacted_on) && (
        <div className="flex flex-wrap items-center gap-1">
          {row.last_contacted_on && (
            <span className="text-2xs text-muted-foreground">Last contacted {row.last_contacted_on}</span>
          )}
          {due && <Badge tone={due.tone}>{due.text}</Badge>}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- list */

function ListView({ creators, members, selected, setSelected, onMove, onOpen, onRemove, onAssign }: {
  creators: CampaignCreator[]
  members: { id: string; name: string }[]
  selected: Set<string>
  setSelected: (s: Set<string>) => void
  onMove: (id: string, stage: string) => void
  onOpen: (cc: CampaignCreator) => void
  onRemove: (id: string) => void
  onAssign: (id: string, ownerId: string | null) => void
}) {
  const toggle = (id: string) => setSelected(toggleIn(selected, id))
  return (
    <div className="surface overflow-hidden">
      <TableScroll>
        <Table>
          <THead>
            <tr>
              <TH className="w-9">
                <Checkbox
                  label="Select all creators"
                  checked={creators.length > 0 && selected.size === creators.length}
                  onChange={() => setSelected(selected.size === creators.length ? new Set() : new Set(creators.map(c => c.id)))}
                />
              </TH>
              <TH>Creator</TH>
              <TH align="right">Followers</TH>
              <TH>Niche</TH>
              <TH>Geography</TH>
              <TH>Contact</TH>
              <TH align="right">Fit</TH>
              <TH>Stage</TH>
              <TH>Owner</TH>
              <TH>Follow-up</TH>
              <TH>Offer</TH>
              <TH>Deliverables</TH>
              <TH className="w-20"><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <tbody>
            {creators.map(r => {
              const due = dueLabel(r.next_follow_up)
              return (
                <TR key={r.id}>
                  <TD><Checkbox label={`Select ${r.handle}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></TD>
                  <TD>
                    <button onClick={() => onOpen(r)} className="max-w-[200px] text-left hover:underline">
                      <CreatorIdentity handle={r.handle} fullName={r.full_name} platform={r.platform} />
                    </button>
                  </TD>
                  <TD align="right"><Followers count={r.follower_count} /></TD>
                  <TD><NicheChip niche={r.niche} /></TD>
                  <TD><GeoBadge status={r.geo_status} /></TD>
                  <TD>
                    <ContactBadge
                      contactStatus={r.contact_status} email={r.email} phone={r.phone}
                      profileUrl={r.profile_url} verification={r.verification_status}
                    />
                  </TD>
                  <TD align="right" className="tnum">{r.match_score == null ? '—' : `${r.match_score}%`}</TD>
                  <TD>
                    <Select aria-label={`Stage for ${r.handle}`} className="h-8 text-2xs" containerClassName="w-40" value={r.stage} onChange={e => onMove(r.id, e.target.value)}>
                      {CC_STAGES.map(s => <option key={s} value={s}>{CC_STAGE_LABELS[s]}</option>)}
                    </Select>
                  </TD>
                  <TD>
                    <Select aria-label={`Owner for ${r.handle}`} className="h-8 text-2xs" containerClassName="w-32" value={r.owner_id ?? ''} onChange={e => onAssign(r.id, e.target.value || null)}>
                      <option value="">Unassigned</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </TD>
                  <TD>{due ? <Badge tone={due.tone}>{due.text}</Badge> : <span className="text-2xs text-muted-foreground">None set</span>}</TD>
                  <TD>{r.offer ? <Badge tone="neutral">{r.offer.status}</Badge> : <span className="text-2xs text-muted-foreground">None</span>}</TD>
                  <TD className="tnum text-2xs">
                    {r.deliverables_total === 0
                      ? <span className="text-muted-foreground">None</span>
                      : <span className={r.deliverables_overdue ? 'text-destructive' : undefined}>
                          {r.deliverables_published}/{r.deliverables_total}{r.deliverables_overdue ? ` · ${r.deliverables_overdue} overdue` : ''}
                        </span>}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => onOpen(r)}>Open</Button>
                      <Button variant="ghost" size="xs" onClick={() => onRemove(r.id)}>
                        <Trash2 className="h-3 w-3" aria-hidden /><span className="sr-only">Remove from campaign</span>
                      </Button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      </TableScroll>
    </div>
  )
}

