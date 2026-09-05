'use client'

import Link from 'next/link'
import { ShieldCheck, Info } from 'lucide-react'
import { useCreatorFacets } from '@/lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { ErrorState, Shimmer } from '@/components/ui/states'
import { geoLabel, entityLabel, qualificationLabel } from '@/lib/domain'
import { nicheLabel, platformLabel, formatNum } from '@/lib/utils'

/**
 * Operations view over the catalog's data-quality columns (migration 0012).
 *
 * This is deliberately NOT the business dashboard: it reports on the state of
 * the sourcing data, not on whether campaigns are working. Each bucket links
 * into the Creators page filtered the same way so a number is always actionable.
 */
export default function DataQualityPage() {
  const { data, isLoading, error, refetch } = useCreatorFacets()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Shimmer className="h-8 w-52" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-56 rounded-xl" />)}</div>
      </div>
    )
  }
  if (error) return <div className="space-y-4"><PageHeader title="Data quality" /><ErrorState error={error} onRetry={() => refetch()} /></div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data quality"
        description="What is actually known about the creator catalog. Every number links into the Creators page filtered the same way."
      />

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          The catalog mixes sourcing generations. Language codes that were stored in the country field have been moved to a
          separate language column and are never rendered as geography. US evidence is graded rather than flattened into one
          label, and organisations are flagged for review rather than presented as influencers.
        </span>
      </p>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Panel
          title="Qualification"
          total={data.total}
          rows={data.qualification_status.map(r => ({
            label: qualificationLabel(r.value), count: r.count,
            href: `/creators?view=all&qualification=${r.value}`,
          }))}
          note="Derived from platform, verification state, classification and how complete the record is. An explicit human review always overrides it."
        />
        <Panel
          title="Geography confidence"
          total={data.total}
          rows={data.geo_status.map(r => ({
            label: geoLabel(r.value), count: r.count,
            href: `/creators?view=all&geo=${r.value}`,
          }))}
          note="Confirmed means the profile location names the United States. Unverified means a country tag with no supporting location. Unknown means no geography at all — never a guess."
        />
        <Panel
          title="Account classification"
          total={data.total}
          rows={data.entity_type.map(r => ({
            label: entityLabel(r.value), count: r.count,
            href: `/creators?view=all&entity=${r.value}`,
          }))}
          note="A conservative keyword heuristic flags likely organisations and aggregator feeds. It marks records for a human; it never decides that something is an individual creator."
        />
        <Panel
          title="Platform"
          total={data.total}
          rows={data.platform.map(r => ({
            label: platformLabel(r.value), count: r.count,
            href: `/creators?view=all&platform=${r.value}`,
          }))}
          note="Records sourced from GitHub and YouTube live alongside Instagram profiles. Profile links are labelled by the site they actually point at."
        />
        <Panel
          title="Niche"
          total={data.total}
          rows={data.niche.map(r => ({
            label: nicheLabel(r.value), count: r.count,
            href: `/creators?view=all&niche=${r.value}`,
          }))}
          note="Niches come from the sourcing pipeline. A record with no niche cannot be matched against a campaign brief."
        />
      </div>

      <div className="surface p-4">
        <h2 className="section-title mb-2">Next actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/creators?view=needs_class">Review unclassified records</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/creators?view=needs_contact">Find creators needing contact details</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/creators?view=awaiting">Records awaiting Instagram verification</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/sourcing">Sourcing</Link></Button>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, rows, total, note }: {
  title: string
  rows: { label: string; count: number; href: string }[]
  total: number
  note: string
}) {
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <section className="surface p-4">
      <h2 className="section-title mb-3 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{title}</h2>
      <ul className="space-y-1.5">
        {rows.map(r => (
          <li key={r.label}>
            <Link href={r.href} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
              {/* The label shrinks and the track is a fixed size. At 768px the
                  sidebar takes 240px and this grid is two columns, leaving ~232px
                  per panel — a fixed-width label plus a percentage-width bar
                  could not fit and pushed the count past the viewport. */}
              <span className="min-w-0 flex-1 truncate text-[13px] group-hover:text-primary">{r.label}</span>
              <span className="h-2 w-12 shrink-0 overflow-hidden rounded-full bg-muted sm:w-20 lg:w-28">
                <span className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.max((r.count / max) * 100, 3)}%` }} />
              </span>
              <span className="shrink-0 text-2xs tnum text-muted-foreground">
                {formatNum(r.count)} · {Math.round((r.count / Math.max(total, 1)) * 100)}%
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">{note}</p>
    </section>
  )
}
