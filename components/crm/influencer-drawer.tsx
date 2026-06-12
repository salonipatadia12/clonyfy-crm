'use client'

import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TierBadge, PriorityBadge, NicheChip, EngQuality, VerifiedTick } from '@/components/crm/badges'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useInfluencer, useUpdateInfluencer, useAddNote, useAddDeal, useUpdateDeal,
} from '@/lib/api'
import { STAGES, formatFollowers, formatNum, formatMoney, nicheLabel, safeUrl } from '@/lib/utils'
import { ExternalLink, AtSign, Link2, Plus, StickyNote, Handshake, History, Mail } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

export function InfluencerDrawer({ influencerId, onOpenChange }: { influencerId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useInfluencer(influencerId)
  const updateInf = useUpdateInfluencer()

  const inf = data?.influencer
  const profileUrl = safeUrl(inf?.profile_url)
  const bioUrl = safeUrl(inf?.bio_link)

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
            {/* Header */}
            <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-violet-500/15 to-transparent p-6">
              <div className="flex items-start gap-4">
                <Avatar name={inf.name} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-bold">{inf.name}</h2>
                    <VerifiedTick verified={inf.is_verified} />
                  </div>
                  <p className="text-sm text-muted-foreground">@{inf.handle}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TierBadge tier={inf.quality_tier} />
                    <PriorityBadge priority={inf.priority} />
                    <NicheChip niche={inf.niche} />
                    <EngQuality value={inf.eng_quality} />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {profileUrl && (
                  <a href={profileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:border-primary/40">
                    <AtSign className="h-3.5 w-3.5" /> Profile <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
                {bioUrl && (
                  <a href={bioUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:border-primary/40">
                    <Link2 className="h-3.5 w-3.5" /> Bio link <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
                {inf.email && (
                  <a href={`mailto:${inf.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:border-primary/40">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Stage</span>
                <Select
                  value={inf.stage}
                  onChange={(e) => {
                    updateInf.mutate({ id: inf.id, patch: { stage: e.target.value } }, {
                      onSuccess: () => toast.success(`Moved to ${e.target.value}`),
                    })
                  }}
                  className="w-44"
                >
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </div>

            {/* Tabs */}
            <div className="p-6">
              <Tabs defaultValue="overview">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="deals">Deals</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Metric label="Followers" value={formatFollowers(inf.follower_count)} />
                    <Metric label="Engagement" value={inf.engagement_rate != null ? `${inf.engagement_rate}%` : '—'} />
                    <Metric label="Avg Likes" value={formatNum(inf.avg_likes)} />
                    <Metric label="Following" value={formatNum(inf.following_count)} />
                    <Metric label="Posts" value={formatNum(inf.posts_count)} />
                    <Metric label="Account" value={inf.account_type ? inf.account_type : '—'} />
                  </div>
                  {inf.biography && (
                    <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Bio</p>
                      <p className="text-sm leading-relaxed">{inf.biography}</p>
                    </div>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Detail label="Category" value={inf.category} />
                    <Detail label="Niche" value={nicheLabel(inf.niche)} />
                    <Detail label="Market" value={inf.market} />
                    <Detail label="Region seed" value={inf.country_seed} />
                  </dl>
                </TabsContent>

                <TabsContent value="deals">
                  <DealsTab influencerId={inf.id} deals={data.deals} />
                </TabsContent>

                <TabsContent value="notes">
                  <NotesTab influencerId={inf.id} notes={data.notes} />
                </TabsContent>

                <TabsContent value="activity">
                  <ActivityTab data={data} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
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

function NotesTab({ influencerId, notes }: { influencerId: string; notes: { id: number; content: string; created_at: string }[] }) {
  const [content, setContent] = useState('')
  const addNote = useAddNote()
  const submit = () => {
    if (!content.trim()) return
    addNote.mutate({ id: influencerId, content }, { onSuccess: () => { setContent(''); toast.success('Note added') } })
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Add a note… (Enter to save)"
        />
        <Button onClick={submit} disabled={addNote.isPending || !content.trim()}><Plus className="h-4 w-4" /></Button>
      </div>
      {notes.length === 0 ? (
        <Empty icon={StickyNote} text="No notes yet. Capture your first outreach detail." />
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <p className="text-sm">{n.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DealsTab({ influencerId, deals }: { influencerId: string; deals: any[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'active' | 'completed' | 'cancelled'>('active')
  const addDeal = useAddDeal()
  const updateDeal = useUpdateDeal()

  const submit = () => {
    if (!title.trim()) return
    addDeal.mutate(
      { influencer_id: influencerId, title, deal_value: value ? Number(value) : null, status },
      { onSuccess: () => { setTitle(''); setValue(''); setStatus('active'); setOpen(false); toast.success('Deal created') } }
    )
  }

  return (
    <div className="space-y-4">
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)} className="w-full border border-dashed border-border hover:border-primary/40">
          <Plus className="mr-1 h-4 w-4" /> New deal
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title (e.g. Q3 Reel collab)" />
          <div className="flex gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (USD)" type="number" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-36">
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={addDeal.isPending || !title.trim()} className="flex-1">Save deal</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {deals.length === 0 ? (
        <Empty icon={Handshake} text="No deals yet. Log a collaboration to track revenue." />
      ) : (
        <div className="space-y-2">
          {deals.map(d => (
            <div key={d.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-sm font-bold text-emerald-400">{formatMoney(d.deal_value, d.currency)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value={d.status}
                  onChange={(e) => updateDeal.mutate({ id: d.id, patch: { status: e.target.value } }, { onSuccess: () => toast.success('Deal updated') })}
                  className="h-7 w-32 text-xs"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTab({ data }: { data: NonNullable<ReturnType<typeof useInfluencer>['data']> }) {
  const events = [
    ...data.pipeline.map(p => ({ t: p.changed_at, kind: 'stage' as const, text: `Moved ${p.from_stage ? `from ${p.from_stage} ` : ''}to ${p.to_stage}` })),
    ...data.notes.map(n => ({ t: n.created_at, kind: 'note' as const, text: n.content })),
    ...data.deals.map(d => ({ t: d.created_at, kind: 'deal' as const, text: `Deal: ${d.title}` })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1))

  if (!events.length) return <Empty icon={History} text="No activity yet. Stage moves, notes, and deals show up here." />

  const dot: Record<string, string> = { stage: 'bg-violet-400', note: 'bg-amber-400', deal: 'bg-emerald-400' }
  return (
    <div className="relative space-y-4 pl-4">
      <div className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
      {events.map((e, i) => (
        <div key={i} className="relative">
          <span className={`absolute -left-[11px] top-1.5 h-2.5 w-2.5 rounded-full ${dot[e.kind]} ring-4 ring-background`} />
          <p className="text-sm">{e.text}</p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.t), { addSuffix: true })}</p>
        </div>
      ))}
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-center">
      <Icon className="mb-2 h-7 w-7 text-muted-foreground/60" />
      <p className="max-w-[240px] text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
