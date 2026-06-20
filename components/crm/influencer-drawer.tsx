'use client'

import { useEffect, useRef, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NicheChip, VerifiedTick } from '@/components/crm/badges'
import { CloseDealPrompt, type CloseTarget } from '@/components/crm/close-deal-prompt'
import { Skeleton } from '@/components/ui/skeleton'
import { useInfluencer, useUpdatePipeline, useAddToPipeline, useRemoveFromPipeline, useReassign, useMembers, useTemplates, useComments, useAddComment, useDeleteComment, useCreateDeal, useCampaigns, type AddToPipelineResult } from '@/lib/api'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { STAGES, stageLabel, formatFollowers, formatNum, nicheLabel, safeUrl, cn } from '@/lib/utils'
import type { PipelineRow, Stage, ActivityEvent } from '@/types/database'
import { ExternalLink, Plus, History, Mail, Copy, Clock, Trash2, Film, Percent, Users, MessageSquare, Send, Handshake, CalendarClock, Megaphone } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const DM_TEMPLATES = [
  { name: 'Intro', subject: 'Quick collab idea', body: "Hey {{first_name}}! Love your content on {{handle}} — we work with creators in {{niche}} and think you'd be a great fit. Open to a quick collab chat?" },
  { name: 'Follow-up', subject: 'Circling back', body: "Hi {{first_name}}, circling back on my last message — would love to share what we have in mind. Got 2 minutes this week?" },
  { name: 'Collab', subject: 'Partnership idea', body: "Hi {{first_name}}! We'd love to collaborate on a reel + story with your {{follower_count}} audience. Can you share how you usually work with brands?" },
]

interface Inf {
  id: string; handle: string; full_name?: string | null; name?: string | null
  follower_count: number | null; following_count?: number | null; posts_count?: number | null
  niche: string | null; country: string | null; biography: string | null
  bio_link: string | null; profile_url: string | null; is_verified: boolean; email: string | null
}

function resolveTemplate(body: string, inf: Inf): string {
  const name = inf.full_name || inf.name || inf.handle
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, name.split(' ')[0] || name)
    .replace(/\{\{\s*handle\s*\}\}/gi, `@${inf.handle}`)
    .replace(/\{\{\s*follower_count\s*\}\}/gi, formatFollowers(inf.follower_count))
    .replace(/\{\{\s*niche\s*\}\}/gi, nicheLabel(inf.niche))
    .replace(/\{\{\s*country\s*\}\}/gi, (inf.country || '').toUpperCase())
}

export function InfluencerDrawer({ influencerId, onOpenChange }: { influencerId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useInfluencer(influencerId)
  const updatePipe = useUpdatePipeline()
  const addToPipeline = useAddToPipeline()
  const removeFromPipeline = useRemoveFromPipeline()
  const reassign = useReassign()
  const createDeal = useCreateDeal()
  const isAdmin = useIsAdmin()
  const { data: membersData } = useMembers()
  const members = membersData?.members ?? []
  const [conflict, setConflict] = useState<AddToPipelineResult['conflicts'][number] | null>(null)
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null)

  const inf = data?.influencer as Inf | undefined
  const pipe: PipelineRow | undefined = data?.pipeline?.[0]
  const profileUrl = safeUrl(inf?.profile_url)
  const name = inf?.full_name || inf?.name || inf?.handle || ''

  const doAdd = (force = false) => {
    if (!inf) return
    addToPipeline.mutate({ handles: [inf.handle], force }, {
      onSuccess: (r) => {
        if (r.added) { toast.success('Added to your pipeline'); setConflict(null) }
        else if (r.conflicts.length) setConflict(r.conflicts[0])
        else toast.info('Already in pipeline')
      },
    })
  }

  return (
    <Sheet open={!!influencerId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[580px]">
        {isLoading || !inf ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div>
            <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-violet-500/15 to-transparent p-6">
              <div className="flex items-start gap-4">
                <Avatar name={name} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-bold">{name}</h2>
                    <VerifiedTick verified={inf.is_verified} />
                  </div>
                  <p className="text-sm text-muted-foreground">@{inf.handle}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <NicheChip niche={inf.niche} />
                    {inf.country && <span className="text-xs uppercase text-muted-foreground">{inf.country}</span>}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {profileUrl && (
                  <a href={profileUrl} target="_blank" rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    Open on Instagram <ExternalLink className="h-3 w-3 opacity-70" />
                  </a>
                )}
                {inf.email && (
                  <a href={`mailto:${inf.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:border-primary/40">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
                <TemplateButton inf={inf} />
              </div>

              {/* Stage control (pipeline mode) or Add CTA (browse mode) */}
              {pipe ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Stage</span>
                    <Select
                      value={pipe.stage}
                      onChange={(e) => {
                        const next = e.target.value as Stage
                        const wasClosed = pipe.stage === 'closed'
                        updatePipe.mutate({ id: pipe.id, patch: { stage: next } }, {
                          onSuccess: () => { toast.success(`Moved to ${stageLabel(next)}`); if (next === 'closed' && !wasClosed) setCloseTarget({ pipelineId: pipe.id, handle: inf.handle, fullName: name }) },
                        })
                      }}
                      className="w-44"
                    >
                      {STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
                    </Select>
                    <button
                      onClick={() => removeFromPipeline.mutate(pipe.id, { onSuccess: () => toast.success('Removed from pipeline') })}
                      disabled={removeFromPipeline.isPending}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                      title="Move back — remove from pipeline">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Assigned to</span>
                      <Select
                        value={pipe.assigned_to ?? ''}
                        onChange={(e) => { if (e.target.value && e.target.value !== pipe.assigned_to) reassign.mutate({ id: pipe.id, toUserId: e.target.value }, { onSuccess: () => toast.success('Reassigned') }) }}
                        className="w-44"
                      >
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </Select>
                    </div>
                  )}
                  {!isAdmin && pipe.assigned_name && <p className="text-xs text-muted-foreground">Owner: {pipe.assigned_name}</p>}
                  <button
                    onClick={() => createDeal.mutate({ pipeline_id: pipe.id }, {
                      onSuccess: () => toast.success('Deal created — see the Deals page'),
                      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create deal'),
                    })}
                    disabled={createDeal.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15">
                    <Handshake className="h-3.5 w-3.5" /> Create deal
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <Button size="sm" disabled={addToPipeline.isPending} onClick={() => doAdd(false)}>
                    <Plus className="mr-1 h-4 w-4" /> Add to Pipeline
                  </Button>
                </div>
              )}
            </div>

            <div className="p-6">
              <Tabs defaultValue="overview">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  {pipe && <TabsTrigger value="work">Pipeline</TabsTrigger>}
                  <TabsTrigger value="discussion">Discussion</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Metric label="Followers" value={formatFollowers(inf.follower_count)} />
                    <Metric label="Following" value={formatNum(inf.following_count)} />
                    <Metric label="Posts" value={formatNum(inf.posts_count)} />
                  </div>
                  {inf.biography && (
                    <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Bio</p>
                      <p className="text-sm leading-relaxed">{inf.biography}</p>
                    </div>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Detail label="Niche" value={nicheLabel(inf.niche)} />
                    <Detail label="Country" value={inf.country?.toUpperCase()} />
                  </dl>
                </TabsContent>

                {pipe && (
                  <TabsContent value="work">
                    <PipelineWork row={pipe}
                      onPatch={(patch, msg) => updatePipe.mutate({ id: pipe.id, patch }, { onSuccess: () => msg && toast.success(msg) })}
                      onRemove={() => removeFromPipeline.mutate(pipe.id, {
                        onSuccess: () => { toast.success('Removed from pipeline'); onOpenChange(false) },
                      })}
                    />
                  </TabsContent>
                )}

                <TabsContent value="discussion">
                  <CommentsTab handle={inf.handle} />
                </TabsContent>

                <TabsContent value="activity">
                  <ActivityTab events={data?.activity ?? []} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}

        {/* Conflict modal (spec §4) */}
        <Modal open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}
          title="Already in a teammate's pipeline"
          description={conflict ? `@${conflict.handle} is owned by ${conflict.assigned_name ?? 'a teammate'}.` : ''}>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button size="sm" onClick={() => doAdd(true)} disabled={addToPipeline.isPending}>Add anyway (to me)</Button>
            )}
            <Button size="sm" variant="ghost" className="border border-border" onClick={() => setConflict(null)}>Cancel</Button>
          </div>
          {!isAdmin && <p className="mt-2 text-xs text-muted-foreground">Only an admin can reassign or duplicate this contact.</p>}
        </Modal>

        <CloseDealPrompt target={closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null) }} />
      </SheetContent>
    </Sheet>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold capitalize">{value}</p>
    </div>
  )
}
function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value || '—'}</dd>
    </div>
  )
}

// Pipeline-mode editing: notes (auto-save on blur), commission, reel URL, remove.
function PipelineWork({ row, onPatch, onRemove }: {
  row: PipelineRow
  onPatch: (patch: Record<string, unknown>, msg?: string) => void
  onRemove: () => void
}) {
  const { data: campData } = useCampaigns()
  const campaigns = campData?.campaigns ?? []
  const [notes, setNotes] = useState(row.notes ?? '')
  const [cType, setCType] = useState(row.commission_type ?? '')
  const [cPct, setCPct] = useState(row.commission_percentage?.toString() ?? '')
  const [cFlat, setCFlat] = useState(row.commission_flat ?? '')
  const [reelUrl, setReelUrl] = useState(row.reel_url ?? '')
  const [reelViews, setReelViews] = useState(row.reel_views?.toString() ?? '')
  useEffect(() => { setNotes(row.notes ?? '') }, [row.id, row.notes])

  const showReel = row.stage === 'live' || row.stage === 'completed'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Last touch</p>
          <p className="text-sm">{row.last_touch ? formatDistanceToNow(new Date(row.last_touch), { addSuffix: true }) : 'No activity yet'}</p>
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Next follow-up</p>
          <div className="flex items-center gap-1.5">
            <Input type="date" defaultValue={row.next_follow_up ?? ''} key={`${row.id}-${row.next_follow_up ?? ''}`}
              onChange={(e) => onPatch({ next_follow_up: e.target.value || null }, e.target.value ? 'Follow-up set' : 'Follow-up cleared')}
              className={cn('h-8 text-xs', row.next_follow_up && row.next_follow_up <= new Date().toISOString().slice(0, 10) && 'border-amber-500/40 text-amber-400')} />
            <button type="button" title="Follow up in a week"
              onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); onPatch({ next_follow_up: d.toISOString().slice(0, 10) }, 'Follow-up set') }}
              className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">+1w</button>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Megaphone className="h-3.5 w-3.5" /> Campaign</p>
        <Select value={row.campaign_id ?? ''} onChange={(e) => onPatch({ campaign_id: e.target.value || null }, 'Campaign updated')}>
          <option value="">No campaign</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes <span className="text-muted-foreground/60">(saves on blur)</span></label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (row.notes ?? '')) onPatch({ notes }, 'Notes saved') }}
          rows={4}
          placeholder="Outreach notes, context, next steps…"
          className="w-full rounded-lg border border-border bg-card/40 p-3 text-sm outline-none focus:border-primary/50"
        />
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Percent className="h-3.5 w-3.5" /> Commission</p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={cType} onChange={(e) => setCType(e.target.value as typeof cType)}>
            <option value="">No commission</option>
            <option value="percentage">Percentage</option>
            <option value="flat">Flat</option>
            <option value="both">Both</option>
          </Select>
          {(cType === 'percentage' || cType === 'both') && (
            <Input type="number" value={cPct} onChange={(e) => setCPct(e.target.value)} placeholder="%" />
          )}
          {(cType === 'flat' || cType === 'both') && (
            <Input value={cFlat} onChange={(e) => setCFlat(e.target.value)} placeholder="e.g. 2 free products" />
          )}
        </div>
        <Button size="sm" variant="ghost" className="mt-2 border border-border"
          onClick={() => onPatch({ commission_type: cType || null, commission_percentage: cPct ? Number(cPct) : null, commission_flat: cFlat || null }, 'Commission saved')}>
          Save commission
        </Button>
      </div>

      {showReel && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Film className="h-3.5 w-3.5" /> Reel</p>
          <div className="space-y-2">
            <Input value={reelUrl} onChange={(e) => setReelUrl(e.target.value)} placeholder="Reel URL" />
            <Input type="number" value={reelViews} onChange={(e) => setReelViews(e.target.value)} placeholder="Views" />
            <Button size="sm" variant="ghost" className="border border-border"
              onClick={() => onPatch({ reel_url: reelUrl || null, reel_views: reelViews ? Number(reelViews) : null }, 'Reel saved')}>
              Save reel
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border/60 pt-4">
        <Button size="sm" variant="ghost" onClick={onRemove}
          className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10">
          <Trash2 className="mr-1.5 h-4 w-4" /> Remove from pipeline
        </Button>
      </div>
    </div>
  )
}

function TemplateButton({ inf }: { inf: Inf }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{ name: string; subject?: string | null; body: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useTemplates()
  // Workspace templates take precedence; fall back to built-in defaults.
  const templates = (data?.templates?.length ? data.templates.map(t => ({ name: t.name, subject: t.subject, body: t.body })) : DM_TEMPLATES)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const useTemplate = (body: string) => {
    navigator.clipboard?.writeText(resolveTemplate(body, inf))
    toast.success('Copied — paste into Instagram DM')
    setPreview(null)
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:border-primary/40">
        <Copy className="h-3.5 w-3.5" /> Use template
      </button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-72 rounded-xl border border-border bg-popover p-1 shadow-xl">
          {templates.map((t, i) => (
            <button key={i} onClick={() => { setPreview(t); setOpen(false) }} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted">
              <span className="font-medium">{t.name}</span>
              <span className="mt-0.5 block truncate text-muted-foreground">{resolveTemplate(t.body, inf)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Preview-to-confirm (spec #10): see the personalized message before copying. */}
      <Modal open={!!preview} onOpenChange={(o) => !o && setPreview(null)}
        title={preview?.name ?? 'Template'}
        description={preview?.subject ? `Subject: ${resolveTemplate(preview.subject, inf)}` : `Personalized for @${inf.handle}`}>
        {preview && (
          <div className="space-y-3">
            <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed">{resolveTemplate(preview.body, inf)}</div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => useTemplate(preview.body)}><Copy className="mr-1.5 h-4 w-4" /> Copy &amp; use</Button>
              <Button size="sm" variant="ghost" className="border border-border" onClick={() => setPreview(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function CommentsTab({ handle }: { handle: string }) {
  const me = useAuth()
  const isAdmin = useIsAdmin()
  const { data: members } = useMembers()
  const { data, isLoading } = useComments(handle)
  const add = useAddComment(handle)
  const del = useDeleteComment(handle)
  const [text, setText] = useState('')
  const comments = data?.comments ?? []

  const submit = () => {
    if (!text.trim()) return
    add.mutate(text.trim(), { onSuccess: () => setText('') })
  }
  const teammates = (members?.members ?? []).filter(m => m.id !== me.id)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card/40 p-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="Leave a note for the team… use @name to mention"
          className="w-full resize-none bg-transparent p-1.5 text-sm outline-none"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            {teammates.length ? `Mention: ${teammates.slice(0, 3).map(m => '@' + (m.name.split(' ')[0] || m.name)).join(' ')}` : 'No teammates yet'}
          </span>
          <Button size="sm" onClick={submit} disabled={add.isPending || !text.trim()}><Send className="mr-1 h-3.5 w-3.5" /> Post</Button>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-20 w-full" /> : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
          <MessageSquare className="mb-2 h-7 w-7 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.author_name || '?'} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author_name}</span>
                  <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                  {(isAdmin || c.author_id === me.id) && (
                    <button onClick={() => del.mutate(c.id)} className="ml-auto text-muted-foreground hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{renderMentions(c.body)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderMentions(body: string) {
  return body.split(/(@[a-z0-9_.-]+)/gi).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="font-medium text-primary">{part}</span>
      : <span key={i}>{part}</span>)
}

function ActivityTab({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-center">
        <History className="mb-2 h-7 w-7 text-muted-foreground/60" />
        <p className="max-w-[240px] text-sm text-muted-foreground">No activity yet. Stage moves, notes, and reels show up here.</p>
      </div>
    )
  }
  const text = (e: ActivityEvent) => {
    const m = (e.metadata ?? {}) as { from?: string; to?: string }
    switch (e.action) {
      case 'added_to_pipeline': return 'Added to pipeline'
      case 'stage_changed': return `Stage → ${stageLabel(m.to as Stage)}`
      case 'reel_url_added': return 'Reel logged'
      case 'notes_updated': return 'Notes updated'
      case 'commission_set': return 'Commission set'
      case 'reassigned': return 'Reassigned'
      case 'assigned': return 'Assigned'
      case 'removed_from_pipeline': return 'Removed from pipeline'
      default: return e.action
    }
  }
  return (
    <div className="relative space-y-4 pl-4">
      <div className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
      {events.map((e) => (
        <div key={e.id} className="relative">
          <span className="absolute -left-[11px] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-400 ring-4 ring-background" />
          <p className="text-sm">{text(e)} <span className="text-xs text-muted-foreground">by {e.user_name || 'someone'}</span></p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</p>
        </div>
      ))}
    </div>
  )
}
