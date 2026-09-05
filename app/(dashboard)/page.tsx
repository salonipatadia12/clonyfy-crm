'use client'

import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, CheckCircle2, FileText,
  MessageSquareReply, PackageCheck, Search, Megaphone, Users, Activity,
} from 'lucide-react'
import { useToday } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { StageBadge } from '@/components/crm/creator-badges'
import { relativeDate, dueLabel, ccStageLabel } from '@/lib/domain'
import { formatNum } from '@/lib/utils'
import type { TodayResponse, TodayItem, TodayDeliverable } from '@/types/campaign'

export default function TodayPage() {
  const { data, isLoading, error, refetch } = useToday()

  if (isLoading) return <TodaySkeleton />
  if (error) return (
    <div className="space-y-4">
      <PageHeader title="Today" description="What needs your attention right now." />
      <ErrorState error={error} onRetry={() => refetch()} />
    </div>
  )
  if (!data) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Today"
        description={data.hasAnyOperationalData
          ? 'Follow-ups, replies, deliverables and campaigns that need a decision.'
          : 'Set up your first client product campaign and start finding creators for it.'}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/creators"><Search className="h-3.5 w-3.5" aria-hidden /> Find creators</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/campaigns/new"><Megaphone className="h-3.5 w-3.5" aria-hidden /> New campaign</Link>
            </Button>
          </>
        }
      />

      {!data.hasAnyOperationalData ? <FirstRun data={data} /> : <Work data={data} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* First run: there is a catalog but no campaign work yet.             */
/* ------------------------------------------------------------------ */

function FirstRun({ data }: { data: TodayResponse }) {
  const steps = [
    {
      done: data.counts.clients > 0,
      icon: Building2,
      title: 'Add a client and a product',
      body: 'A campaign always promotes one product for one client. Products are reusable across campaigns.',
      cta: { href: '/clients', label: data.counts.clients ? 'Manage clients' : 'Add your first client' },
    },
    {
      done: data.counts.campaigns > 0,
      icon: Megaphone,
      title: 'Create a campaign around that product',
      body: 'The campaign carries the creator brief, the offer, the deliverables and the messaging.',
      cta: { href: '/campaigns/new', label: 'Create a campaign' },
    },
    {
      done: data.counts.creatorsInCampaigns > 0,
      icon: Users,
      title: 'Find and shortlist matching creators',
      body: `Your catalog holds ${formatNum(data.counts.catalog)} records. Open a campaign and use "Find creators" to search it against that campaign's brief.`,
      cta: { href: '/creators', label: 'Browse creators' },
    },
    {
      done: data.counts.templates > 0,
      icon: FileText,
      title: 'Write an outreach template',
      body: 'Channel-aware templates with campaign variables, previewed against a real creator before you copy them.',
      cta: { href: '/templates', label: 'Create a template' },
    },
  ]

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Get the workspace running</CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Four steps from an empty workspace to live outreach.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {steps.map((s, i) => (
            <div key={s.title} className="flex flex-wrap items-start gap-3 p-4">
              <span className={s.done
                ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'}>
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  <span className="text-2xs text-muted-foreground">Step {i + 1}</span>
                  {s.title}
                  {s.done && <Badge tone="success">Done</Badge>}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
              <Button asChild variant={s.done ? 'outline' : 'default'} size="sm">
                <Link href={s.cta.href}>{s.cta.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Workspace contents</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Creator catalog" value={formatNum(data.counts.catalog)} href="/creators" />
          <Stat label="Clients" value={formatNum(data.counts.clients)} href="/clients" />
          <Stat label="Products" value={formatNum(data.counts.products)} href="/clients" />
          <Stat label="Templates" value={formatNum(data.counts.templates)} href="/templates" />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, href, tone }: { label: string; value: string; href: string; tone?: 'danger' | 'warning' }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
    >
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tnum ${tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
        {value}
      </p>
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Working dashboard                                                   */
/* ------------------------------------------------------------------ */

function Work({ data }: { data: TodayResponse }) {
  const overdue = data.followUpsOverdue.length
  const dueToday = data.followUpsToday.length
  const nothingUrgent = overdue + dueToday + data.recentReplies.length
    + data.deliverablesDue.length + data.awaitingApproval.length === 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Follow-ups overdue" value={formatNum(overdue)} href="/outreach?queue=follow_up_due" tone={overdue ? 'danger' : undefined} />
        <Stat label="Replies to action" value={formatNum(data.recentReplies.length)} href="/outreach?queue=replied" />
        <Stat label="Deliverables due soon" value={formatNum(data.deliverablesDue.length)} href="/deliverables?view=due_soon" tone={data.deliverablesDue.length ? 'warning' : undefined} />
        <Stat label="Awaiting approval" value={formatNum(data.awaitingApproval.length)} href="/deliverables?view=awaiting_approval" />
      </div>

      {nothingUrgent && (
        <EmptyState
          icon={CheckCircle2}
          compact
          title="Nothing is overdue"
          description="No follow-ups, replies or deliverables need you right now. Keep the pipeline moving by shortlisting more creators for an active campaign."
          actions={<Button asChild size="sm"><Link href="/campaigns">Open campaigns</Link></Button>}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <ItemList
          title="Follow-ups due"
          icon={CalendarClock}
          items={[...data.followUpsOverdue, ...data.followUpsToday]}
          emptyTitle="No follow-ups scheduled for today"
          emptyBody="Set a follow-up date when you log an outreach message and it will surface here."
          href="/outreach?queue=follow_up_due"
        />
        <ItemList
          title="Replies received"
          icon={MessageSquareReply}
          items={data.recentReplies}
          emptyTitle="No replies logged yet"
          emptyBody="Log a reply from the campaign board or the Outreach queue and it appears here."
          href="/outreach?queue=replied"
        />
        <DeliverableList
          title="Deliverables due soon"
          icon={PackageCheck}
          items={data.deliverablesDue}
          emptyTitle="Nothing due in the next 7 days"
          emptyBody="Deliverables with a due date show up here a week ahead."
          href="/deliverables?view=due_soon"
        />
        <DeliverableList
          title="Content awaiting approval"
          icon={CheckCircle2}
          items={data.awaitingApproval}
          emptyTitle="No content waiting on you"
          emptyBody="When a creator submits a draft, it lands here for review."
          href="/deliverables?view=awaiting_approval"
        />
      </div>

      {data.campaignsAtRisk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              Campaigns falling behind
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {data.campaignsAtRisk.map(c => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {[c.client_name, c.product_name].filter(Boolean).join(' · ') || 'No client/product linked'}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {c.reasons.map(r => <Badge key={r} tone="warning">{r}</Badge>)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Active campaigns</CardTitle>
            <Link href="/campaigns" className="text-2xs text-primary hover:underline">All campaigns</Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.activeCampaigns.length === 0 ? (
              <EmptyState compact icon={Megaphone} title="No active campaigns"
                description="Create one to start assigning creators."
                actions={<Button asChild size="sm"><Link href="/campaigns/new">New campaign</Link></Button>} />
            ) : (
              <ul className="divide-y divide-border">
                {data.activeCampaigns.map(c => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-accent/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{c.name}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {[c.client_name, c.product_name].filter(Boolean).join(' · ') || 'No product linked'}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 text-2xs text-muted-foreground tnum">
                        <span>{c.creators}{c.target ? `/${c.target}` : ''} creators</span>
                        <span>{c.contacted} contacted</span>
                        <span>{c.agreed} agreed</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" aria-hidden />Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState compact title="No activity yet" description="Stage changes and outreach logs appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {data.recentActivity.map(a => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.user_name ?? 'Someone'}</span>{' '}
                      <span className="text-muted-foreground">{describeActivity(a)}</span>
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{relativeDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function describeActivity(a: TodayResponse['recentActivity'][number]): string {
  const who = a.profile_handle ? `@${a.profile_handle}` : 'a creator'
  const m = (a.metadata ?? {}) as Record<string, unknown>
  switch (a.action) {
    case 'added_to_pipeline': return `added ${who}${m.campaign ? ` to ${m.campaign}` : ''}`
    case 'removed_from_pipeline': return `removed ${who} from a campaign`
    case 'stage_changed': return `moved ${who} to ${ccStageLabel(String(m.to ?? ''))}`
    case 'notes_updated': return m.outreach ? `logged ${String(m.outreach).replace('_', ' ')} with ${who}` : `updated notes on ${who}`
    default: return `updated ${who}`
  }
}

function ItemList({ title, icon: Icon, items, emptyTitle, emptyBody, href }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: TodayItem[]
  emptyTitle: string
  emptyBody: string
  href: string
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden />{title}</CardTitle>
        {items.length > 0 && <Link href={href} className="text-2xs text-primary hover:underline">Open queue</Link>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0
          ? <EmptyState compact title={emptyTitle} description={emptyBody} />
          : (
            <ul className="divide-y divide-border">
              {items.map(i => {
                const due = dueLabel(i.date && i.date.length === 10 ? i.date : null)
                return (
                  <li key={i.campaign_creator_id + (i.date ?? '')}>
                    <Link href={`/campaigns/${i.campaign_id}?creator=${i.campaign_creator_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-accent/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{i.full_name || `@${i.handle}`}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {i.campaign_name}{i.product_name ? ` · ${i.product_name}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <StageBadge stage={i.stage} />
                        {due && <Badge tone={due.tone}>{due.text}</Badge>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
      </CardContent>
    </Card>
  )
}

function DeliverableList({ title, icon: Icon, items, emptyTitle, emptyBody, href }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: TodayDeliverable[]
  emptyTitle: string
  emptyBody: string
  href: string
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden />{title}</CardTitle>
        {items.length > 0 && <Link href={href} className="text-2xs text-primary hover:underline">Open list</Link>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0
          ? <EmptyState compact title={emptyTitle} description={emptyBody} />
          : (
            <ul className="divide-y divide-border">
              {items.map(d => {
                const due = dueLabel(d.due_date)
                return (
                  <li key={d.id}>
                    <Link href={`/deliverables?campaignId=${d.campaign_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-accent/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{d.title || d.kind} · @{d.handle}</span>
                        <span className="block truncate text-2xs text-muted-foreground">{d.campaign_name}</span>
                      </span>
                      {due && <Badge tone={due.tone}>{due.text}</Badge>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
      </CardContent>
    </Card>
  )
}

function TodaySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Shimmer className="h-7 w-32" />
        <Shimmer className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-[74px] rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-64 rounded-xl" />)}
      </div>
    </div>
  )
}
