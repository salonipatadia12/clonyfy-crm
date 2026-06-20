'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeal, useUpdateDeal, useDeleteDeal, useAddDealVideo, useUpdateDealVideo, useDeleteDealVideo } from '@/lib/api'
import { formatNum, safeUrl, cn } from '@/lib/utils'
import { SignedBadge, ApprovalBadge } from '@/components/crm/badges'
import { ExternalLink, Film, Trash2, Plus, Eye, Heart, MessageCircle, Activity, PenLine, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import type { DealVideo, ApprovalStatus } from '@/types/database'

function engagement(v: DealVideo): number | null {
  if (!v.views || v.views <= 0) return null
  return ((v.likes ?? 0) + (v.comments ?? 0)) / v.views * 100
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const isOverdue = (v: DealVideo) => !!v.due_date && v.due_date <= todayISO() && v.approval_status !== 'posted'

export function DealDrawer({ dealId, onOpenChange }: { dealId: string | null; onOpenChange: (o: boolean) => void }) {
  const { data: deal, isLoading } = useDeal(dealId)
  const update = useUpdateDeal()
  const del = useDeleteDeal()
  const addVideo = useAddDealVideo(dealId ?? '')

  const [title, setTitle] = useState('')
  const [planned, setPlanned] = useState('1')
  const [notes, setNotes] = useState('')
  const [agreement, setAgreement] = useState('')
  useEffect(() => {
    if (deal) { setTitle(deal.title); setPlanned(String(deal.videos_planned)); setNotes(deal.notes ?? ''); setAgreement(deal.agreement_url ?? '') }
  }, [deal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Record<string, unknown>, msg = 'Saved') =>
    dealId && update.mutate({ id: dealId, patch }, { onSuccess: () => toast.success(msg) })

  const ig = safeUrl(deal ? `https://www.instagram.com/${deal.handle}/` : null)
  const totalViews = deal?.videos.reduce((s, v) => s + (v.views ?? 0), 0) ?? 0

  return (
    <Sheet open={!!dealId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
        {isLoading || !deal ? (
          <div className="space-y-4 p-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
        ) : (
          <div>
            <div className="border-b border-border/60 bg-gradient-to-br from-violet-500/15 to-transparent p-6">
              <div className="flex items-center gap-3">
                <Avatar name={deal.influencer_name || deal.handle} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{deal.influencer_name || deal.handle}</p>
                  <p className="text-xs text-muted-foreground">@{deal.handle}{deal.owner_name ? ` · owner ${deal.owner_name}` : ''}</p>
                  {deal.created_by_name && <p className="text-[11px] text-muted-foreground/80">Created by {deal.created_by_name}</p>}
                </div>
                {ig && <a href={ig} target="_blank" rel="noreferrer noopener" className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">Deal title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title !== deal.title) save({ title }) }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Status</label>
                  <Select value={deal.status} onChange={(e) => save({ status: e.target.value }, 'Status updated')}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Videos planned</label>
                  <Input type="number" min={0} value={planned} onChange={(e) => setPlanned(e.target.value)}
                    onBlur={() => { if (Number(planned) !== deal.videos_planned) save({ videos_planned: Number(planned) }) }} />
                </div>
              </div>

              {/* Signing — the agreement step. signed_at is orthogonal to status. */}
              <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SignedBadge signedAt={deal.signed_at} />
                    {deal.signed_at && <span className="text-[11px] text-muted-foreground">on {new Date(deal.signed_at).toLocaleDateString()}</span>}
                  </div>
                  {deal.signed_at ? (
                    <Button size="sm" variant="ghost" className="h-7 border border-border px-2 text-xs" onClick={() => save({ signed: false }, 'Marked unsigned')}>Unsign</Button>
                  ) : (
                    <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => save({ signed: true }, 'Deal signed')}><PenLine className="h-3.5 w-3.5" /> Mark as signed</Button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input value={agreement} onChange={(e) => setAgreement(e.target.value)} onBlur={() => { if (agreement !== (deal.agreement_url ?? '')) save({ agreement_url: agreement }, 'Agreement link saved') }}
                    placeholder="Agreement link (Google Doc, PandaDoc, …)" className="h-8 text-xs" />
                  {safeUrl(deal.agreement_url) && <a href={safeUrl(deal.agreement_url)!} target="_blank" rel="noreferrer noopener" className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Posted" value={`${deal.videos.length}/${deal.videos_planned}`} />
                <Stat label="Total views" value={formatNum(totalViews)} />
                <Stat label="Avg engmt" value={avgEngagement(deal.videos)} />
              </div>
            </div>

            <div className="space-y-5 p-6">
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Film className="h-4 w-4 text-cyan-400" /> Videos &amp; analytics</h3>
                {deal.videos.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">No videos yet. Add the first one below.</p>
                ) : (
                  <div className="space-y-2.5">
                    {deal.videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}
                  </div>
                )}
              </section>

              <AddVideo onAdd={(input) => addVideo.mutate(input, { onSuccess: () => toast.success('Video added') })} pending={addVideo.isPending} />

              <section>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => { if (notes !== (deal.notes ?? '')) save({ notes }, 'Notes saved') }}
                  rows={3} placeholder="Deliverables, timeline, anything to remember…"
                  className="w-full rounded-lg border border-border bg-card/40 p-3 text-sm outline-none focus:border-primary/50" />
              </section>

              <div className="border-t border-border/60 pt-4">
                <Button size="sm" variant="ghost" className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => { if (confirm('Delete this deal and its videos?')) dealId && del.mutate(dealId, { onSuccess: () => { toast.success('Deal deleted'); onOpenChange(false) } }) }}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete deal
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-2.5">
      <p className="text-base font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function avgEngagement(videos: DealVideo[]): string {
  const rates = videos.map(engagement).filter((r): r is number => r != null)
  if (!rates.length) return '—'
  return (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1) + '%'
}

// One video = its own analytics row (URL + views/likes/comments + engagement),
// editable inline and saved on demand.
function VideoCard({ v, index }: { v: DealVideo; index: number }) {
  const update = useUpdateDealVideo()
  const del = useDeleteDealVideo()
  const [url, setUrl] = useState(v.url ?? '')
  const [views, setViews] = useState(v.views?.toString() ?? '')
  const [likes, setLikes] = useState(v.likes?.toString() ?? '')
  const [comments, setComments] = useState(v.comments?.toString() ?? '')
  const eng = engagement(v)
  const link = safeUrl(v.url)
  const dirty = url !== (v.url ?? '') || views !== (v.views?.toString() ?? '') || likes !== (v.likes?.toString() ?? '') || comments !== (v.comments?.toString() ?? '')

  const num = (x: string) => (x === '' ? null : Number(x))
  const saveVideo = () => update.mutate({ id: v.id, patch: { url: url || null, views: num(views), likes: num(likes), comments: num(comments) } }, { onSuccess: () => toast.success('Video saved') })
  const overdue = isOverdue(v)

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          Video {index + 1}
          {link && <a href={link} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">open</a>}
        </span>
        <div className="flex items-center gap-1.5">
          <ApprovalBadge status={v.approval_status} />
          {overdue && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-400">Overdue</span>}
          <button onClick={() => del.mutate(v.id, { onSuccess: () => toast.success('Video removed') })}
            className="text-muted-foreground hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {/* Deliverable workflow: approval state + due date */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">Stage</span>
          <Select value={v.approval_status} onChange={(e) => update.mutate({ id: v.id, patch: { approval_status: e.target.value as ApprovalStatus } }, { onSuccess: () => toast.success('Updated') })} className="h-8 text-xs">
            <option value="planned">Planned</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="posted">Posted</option>
          </Select>
        </div>
        <div>
          <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><CalendarClock className="h-3 w-3" /> Due</span>
          <Input type="date" defaultValue={v.due_date ?? ''} onChange={(e) => update.mutate({ id: v.id, patch: { due_date: e.target.value || null } }, { onSuccess: () => toast.success('Due date set') })} className={cn('h-8 text-xs', overdue && 'border-rose-500/40 text-rose-400')} />
        </div>
      </div>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Video URL (reel/post link)" className="mb-2 text-xs" />
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={<Eye className="h-3 w-3" />} label="Views"><Input type="number" min={0} value={views} onChange={(e) => setViews(e.target.value)} className="h-8 text-xs" /></Metric>
        <Metric icon={<Heart className="h-3 w-3" />} label="Likes"><Input type="number" min={0} value={likes} onChange={(e) => setLikes(e.target.value)} className="h-8 text-xs" /></Metric>
        <Metric icon={<MessageCircle className="h-3 w-3" />} label="Comments"><Input type="number" min={0} value={comments} onChange={(e) => setComments(e.target.value)} className="h-8 text-xs" /></Metric>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-emerald-400" /> Engagement: <span className="font-semibold text-foreground">{eng != null ? eng.toFixed(1) + '%' : '—'}</span>
          {v.views != null && <span className="text-muted-foreground/70"> · {formatNum(v.views)} views</span>}
        </span>
        {dirty && <Button size="sm" onClick={saveVideo} disabled={update.isPending} className="h-7 px-2 text-xs">Save</Button>}
      </div>
    </div>
  )
}

function Metric({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</span>
      {children}
    </div>
  )
}

function AddVideo({ onAdd, pending }: { onAdd: (input: { url?: string; views?: number; likes?: number; comments?: number; due_date?: string; approval_status?: ApprovalStatus }) => void; pending: boolean }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [views, setViews] = useState('')
  const [likes, setLikes] = useState('')
  const [comments, setComments] = useState('')
  const [due, setDue] = useState('')
  const [stage, setStage] = useState<ApprovalStatus>('planned')

  const submit = () => {
    onAdd({
      url: url.trim() || undefined,
      views: views ? Number(views) : undefined,
      likes: likes ? Number(likes) : undefined,
      comments: comments ? Number(comments) : undefined,
      due_date: due || undefined,
      approval_status: stage,
    })
    setUrl(''); setViews(''); setLikes(''); setComments(''); setDue(''); setStage('planned'); setOpen(false)
  }

  if (!open) return (
    <Button size="sm" variant="ghost" className="w-full border border-dashed border-border" onClick={() => setOpen(true)}>
      <Plus className="mr-1.5 h-4 w-4" /> Add deliverable
    </Button>
  )
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Video URL (the reel/post they collaborated on)" className="text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <Select value={stage} onChange={(e) => setStage(e.target.value as ApprovalStatus)} className="text-xs">
          <option value="planned">Planned</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
        </Select>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="text-xs" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" min={0} value={views} onChange={(e) => setViews(e.target.value)} placeholder="Views" className="text-xs" />
        <Input type="number" min={0} value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="Likes" className="text-xs" />
        <Input type="number" min={0} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments" className="text-xs" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending} className="flex-1">{pending ? 'Adding…' : 'Add video'}</Button>
        <Button size="sm" variant="ghost" className="border border-border" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}
