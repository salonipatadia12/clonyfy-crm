'use client'

import { ExternalLink, Mail, Phone, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { safeUrl, nicheLabel, formatFollowers, cn } from '@/lib/utils'
import {
  geoLabel, GEO_TONE, entityLabel, ENTITY_TONE, qualificationLabel, QUALIFICATION_TONE,
  contactLabel, CONTACT_TONE, linkLabelFor, ccStageLabel, CC_STAGE_TONE, type CcStage,
} from '@/lib/domain'

/**
 * Geography chip. Never renders `country` directly: that column holds language
 * codes for ~30% of the catalog. `geo_status` + `geo_evidence` are the honest
 * pair, and the evidence sentence is the chip's tooltip.
 */
export function GeoBadge({ status, evidence }: { status: string | null | undefined; evidence?: string | null }) {
  const s = status ?? 'unknown'
  return <Badge tone={GEO_TONE[s] ?? 'neutral'} title={evidence ?? undefined}>{geoLabel(s)}</Badge>
}

export function EntityBadge({ type }: { type: string | null | undefined }) {
  const t = type ?? 'unclassified'
  if (t === 'individual_creator') return <Badge tone="success">Creator</Badge>
  return <Badge tone={ENTITY_TONE[t] ?? 'neutral'}>{entityLabel(t)}</Badge>
}

export function QualificationBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? 'needs_review'
  return <Badge tone={QUALIFICATION_TONE[s] ?? 'neutral'}>{qualificationLabel(s)}</Badge>
}

/**
 * Contact state as words, not unexplained dots. The previous UI used three
 * coloured dots with no legend, which nobody could read without hovering.
 */
export function ContactBadge({
  contactStatus, email, phone, profileUrl, verification, className,
}: {
  contactStatus?: string | null
  email?: string | null
  phone?: string | null
  profileUrl?: string | null
  verification?: string | null
  className?: string
}) {
  const hasInstagram = !!profileUrl && /instagram\.com/i.test(profileUrl) && verification !== 'pending_instagram_verification'
  const parts: React.ReactNode[] = []
  if (hasInstagram) parts.push(<Badge key="ig" tone="info"><MessageCircle className="h-3 w-3" aria-hidden />Instagram DM</Badge>)
  if (email) parts.push(<Badge key="em" tone="info" title={email}><Mail className="h-3 w-3" aria-hidden />Email</Badge>)
  if (phone) parts.push(<Badge key="ph" tone="info" title={phone}><Phone className="h-3 w-3" aria-hidden />Phone</Badge>)
  if (!parts.length) {
    return <Badge tone={CONTACT_TONE[contactStatus ?? 'none'] ?? 'neutral'} className={className}>{contactLabel(contactStatus)}</Badge>
  }
  return <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>{parts}</span>
}

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={CC_STAGE_TONE[stage as CcStage] ?? 'neutral'}>{ccStageLabel(stage)}</Badge>
}

export function NicheChip({ niche }: { niche: string | null | undefined }) {
  if (!niche) return <span className="text-muted-foreground">Not recorded</span>
  return <Badge tone="outline">{nicheLabel(niche)}</Badge>
}

export function Followers({ count }: { count: number | null | undefined }) {
  if (count == null) return <span className="text-muted-foreground">Not recorded</span>
  return <span className="tnum" title={count.toLocaleString()}>{formatFollowers(count)}</span>
}

/**
 * Renders a link labelled by the site it actually points at.
 *
 * The catalog stores YouTube and GitHub URLs in `profile_url` and all sorts of
 * things in `bio_link`; labelling them all "Instagram" misleads the user about
 * where they are about to go.
 */
export function ProfileLink({ url, className }: { url: string | null | undefined; className?: string }) {
  const href = safeUrl(url)
  if (!href) return <span className="text-muted-foreground">No link</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1 text-primary hover:underline', className)}
    >
      {linkLabelFor(href)}
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/** A creator's handle + name, with the platform it belongs to made explicit. */
export function CreatorIdentity({
  handle, fullName, platform, className,
}: { handle: string; fullName?: string | null; platform?: string | null; className?: string }) {
  const p = platform ?? 'instagram'
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className="truncate text-[13px] font-medium text-foreground">{fullName || handle}</span>
      <span className="truncate text-2xs text-muted-foreground">
        @{handle}{p !== 'instagram' && <span className="ml-1 uppercase">· {p}</span>}
      </span>
    </span>
  )
}
