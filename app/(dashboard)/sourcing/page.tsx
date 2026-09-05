'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Mail, Phone, Users, ShieldAlert, ArrowRight, Radar } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { nicheLabel, cn } from '@/lib/utils'

interface Sourcing {
  totals: {
    catalog: number; contactable: number; complete: number; email_only: number
    phone_only: number; no_contact: number; with_email: number; with_phone: number
    pending_verification: number
  }
  byPlatform: Record<string, number>
  byRoute: Record<string, number>
  bySource: Record<string, number>
  campaigns: Record<string, { total: number; complete: number; email_only: number; phone_only: number; pending: number }>
  contactableByNiche: Record<string, number>
  contactableByCountry: Record<string, number>
  emailTypes: Record<string, number>
  phoneTypes: Record<string, number>
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—')
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export default function SourcingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['sourcing'],
    queryFn: async () => {
      const r = await fetch('/api/sourcing')
      if (!r.ok) throw new Error('failed to load sourcing stats')
      return r.json() as Promise<Sourcing>
    },
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const t = data.totals
  const campaigns = Object.entries(data.campaigns)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sourcing"
        description="Where the catalog came from and how much of it is actually contactable. This is an operations report on the data, not a measure of whether campaigns are working."
      />

      {/* The funnel that matters: a creator you cannot reach is not a lead. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Creators in catalog" value={t.catalog} sub="all platforms" />
        <Kpi icon={Mail} label="Have an email" value={t.with_email} sub={pct(t.with_email, t.catalog)} tone="sky" />
        <Kpi icon={Phone} label="Have a phone" value={t.with_phone} sub={pct(t.with_phone, t.catalog)} tone="amber" />
        <Kpi icon={Radar} label="Email + phone" value={t.complete} sub={`${pct(t.complete, t.catalog)} · a strict subset, not the outreach gate`} tone="emerald" />
      </div>

      <div className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Contact completeness</h2>
        <Bar segments={[
          { label: 'Email + Phone', value: t.complete, className: 'bg-success' },
          { label: 'Email only', value: t.email_only, className: 'bg-primary' },
          { label: 'Phone only', value: t.phone_only, className: 'bg-warning' },
          { label: 'No contact', value: t.no_contact, className: 'bg-muted-foreground/40' },
        ]} total={t.catalog} />
        <p className="mt-3 text-xs text-muted-foreground">
          {t.no_contact.toLocaleString()} of {t.catalog.toLocaleString()}{' '}rows carry no contact detail at all. Those are catalog
          entries, not leads — reaching them needs a contact-recovery pass over each creator&rsquo;s own website.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Having both an email and a phone is a bonus, not a requirement: a creator with a working Instagram profile can be
          DM&rsquo;d today. Outreach queues are organised per channel.
        </p>
        <Link href="/creators?view=needs_contact"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          Review the {t.no_contact.toLocaleString()} records with no contact route <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {t.pending_verification > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            <span className="font-medium text-warning">{t.pending_verification}</span> creators were sourced contact-first and
            have never been scraped on Instagram. Their contacts are verified; their follower count and niche are not.
          </p>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Campaign contribution</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Campaign</th>
                  <th className="px-3 py-2.5 text-right">Imported</th>
                  <th className="px-3 py-2.5 text-right">Email + Phone</th>
                  <th className="px-3 py-2.5 text-right">Email only</th>
                  <th className="px-3 py-2.5 text-right">Phone only</th>
                  <th className="px-3 py-2.5 text-right">Unverified</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(([name, c]) => (
                  <tr key={name} className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">
                      {name.replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ')}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {name.match(/_(\d{8})_\d{6}$/)?.[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.total}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-400">{c.complete}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-sky-400">{c.email_only}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-400">{c.phone_only}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{c.pending || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Discovery route" empty="No route recorded yet."
          rows={Object.entries(data.byRoute).map(([k, v]) => [pretty(k), v])} />
        <Panel title="Platform"
          rows={Object.entries(data.byPlatform).map(([k, v]) => [pretty(k), v])} />
        <Panel title="Contactable by niche" empty="No contactable creators yet."
          rows={Object.entries(data.contactableByNiche).map(([k, v]) => [nicheLabel(k), v])} />
        <Panel title="Contactable by country" empty="No contactable creators yet."
          rows={Object.entries(data.contactableByCountry).map(([k, v]) => [k.toUpperCase(), v])} />
        <Panel title="Email classification" empty="No classified emails yet."
          rows={Object.entries(data.emailTypes).map(([k, v]) => [pretty(k), v])} />
        <Panel title="Phone line type" empty="No classified phones yet."
          rows={Object.entries(data.phoneTypes).map(([k, v]) => [pretty(k), v])} />
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: number; sub?: string; tone?: 'emerald' | 'sky' | 'amber'
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn('h-4 w-4', tone === 'emerald' && 'text-success',
          tone === 'sky' && 'text-primary', tone === 'amber' && 'text-warning')} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Bar({ segments, total }: { segments: { label: string; value: number; className: string }[]; total: number }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.filter(s => s.value > 0).map(s => (
          <div key={s.label} className={s.className} style={{ width: `${(s.value / Math.max(total, 1)) * 100}%` }}
            title={`${s.label}: ${s.value.toLocaleString()}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-2 w-2 rounded-full', s.className)} />
            {s.label} <span className="font-medium text-foreground tabular-nums">{s.value.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, rows, empty }: { title: string; rows: [string, number][]; empty?: string }) {
  const max = Math.max(1, ...rows.map(r => r[1]))
  return (
    <div className="surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">{empty ?? 'Nothing yet.'}</p>}
      <div className="space-y-1.5">
        {rows.slice(0, 10).map(([label, value]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">{value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
