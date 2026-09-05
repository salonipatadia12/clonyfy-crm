/**
 * Shared vocabulary for the campaign model: stage ladders, status labels and the
 * honest renderers for the catalog's data-quality columns.
 *
 * Rendering rules encoded here (they are product requirements, not styling):
 *  - A language code is never rendered as a country.
 *  - A link is labelled by the host it actually points at, never by an assumed
 *    platform.
 *  - Absent data renders as an explicit phrase, never as 0 or a guess.
 */
import type { BadgeTone } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Campaign creator stages — the stage belongs to the (campaign, creator) pair.
// ---------------------------------------------------------------------------
export const CC_STAGES = [
  'suggested', 'shortlisted', 'ready_to_contact', 'contacted', 'replied',
  'negotiating', 'agreed', 'content_in_progress', 'live', 'completed', 'rejected',
] as const
export type CcStage = (typeof CC_STAGES)[number]

export const CC_STAGE_LABELS: Record<CcStage, string> = {
  suggested: 'Suggested',
  shortlisted: 'Shortlisted',
  ready_to_contact: 'Ready to contact',
  contacted: 'Contacted',
  replied: 'Replied',
  negotiating: 'Negotiating',
  agreed: 'Agreed',
  content_in_progress: 'Content in progress',
  live: 'Live',
  completed: 'Completed',
  rejected: 'Rejected / archived',
}
export const ccStageLabel = (s: string | null | undefined) =>
  s ? (CC_STAGE_LABELS[s as CcStage] ?? s) : '—'

export const CC_STAGE_TONE: Record<CcStage, BadgeTone> = {
  suggested: 'neutral',
  shortlisted: 'neutral',
  ready_to_contact: 'info',
  contacted: 'info',
  replied: 'success',
  negotiating: 'warning',
  agreed: 'success',
  content_in_progress: 'warning',
  live: 'success',
  completed: 'success',
  rejected: 'neutral',
}

/** Stages where the creator has been reached and the clock is running. */
export const ACTIVE_OUTREACH_STAGES: CcStage[] = ['contacted', 'replied', 'negotiating']
/** Stages that count as a won relationship. */
export const WON_STAGES: CcStage[] = ['agreed', 'content_in_progress', 'live', 'completed']
/** Stages that no longer need follow-up. */
export const CLOSED_STAGES: CcStage[] = ['completed', 'rejected']

export const ccStageIndex = (s: string) => CC_STAGES.indexOf(s as CcStage)

// ---------------------------------------------------------------------------
// Campaign metadata
// ---------------------------------------------------------------------------
export const CAMPAIGN_STATUSES = ['planning', 'active', 'completed', 'archived'] as const
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning', active: 'Active', completed: 'Completed', archived: 'Archived',
}
export const CAMPAIGN_STATUS_TONE: Record<string, BadgeTone> = {
  planning: 'neutral', active: 'info', completed: 'success', archived: 'neutral',
}

export const OBJECTIVES = [
  { value: 'awareness', label: 'Awareness' },
  { value: 'traffic', label: 'Traffic' },
  { value: 'leads', label: 'Leads' },
  { value: 'sales', label: 'Sales / conversions' },
  { value: 'ugc', label: 'UGC / content creation' },
  { value: 'product_launch', label: 'Product launch' },
  { value: 'custom', label: 'Custom' },
] as const

export const OFFER_TYPES = [
  { value: 'gifted', label: 'Gifted product' },
  { value: 'flat_fee', label: 'Flat fee' },
  { value: 'commission', label: 'Commission' },
  { value: 'flat_plus_commission', label: 'Flat fee + commission' },
  { value: 'custom', label: 'Custom' },
] as const
export const offerTypeLabel = (v: string | null | undefined) =>
  OFFER_TYPES.find(o => o.value === v)?.label ?? 'Not set'

export const OFFER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'counter_offered', label: 'Counter-offered' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
] as const
export const OFFER_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral', sent: 'info', counter_offered: 'warning',
  accepted: 'success', declined: 'danger', withdrawn: 'neutral',
}

export const DELIVERABLE_KINDS = [
  { value: 'reel', label: 'Reel' },
  { value: 'post', label: 'Post' },
  { value: 'story', label: 'Story' },
  { value: 'video', label: 'Video' },
  { value: 'short', label: 'Short' },
  { value: 'livestream', label: 'Livestream' },
  { value: 'ugc_asset', label: 'UGC asset' },
  { value: 'other', label: 'Other' },
] as const
export const deliverableKindLabel = (v: string | null | undefined) =>
  DELIVERABLE_KINDS.find(k => k.value === v)?.label ?? 'Deliverable'

export const APPROVAL_STATES = [
  { value: 'planned', label: 'Planned' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
] as const
export const approvalLabel = (v: string | null | undefined) =>
  APPROVAL_STATES.find(a => a.value === v)?.label ?? '—'
export const APPROVAL_TONE: Record<string, BadgeTone> = {
  planned: 'neutral', submitted: 'info', changes_requested: 'warning',
  approved: 'success', published: 'success',
}

export const CHANNELS = [
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Other' },
] as const
export const channelLabel = (v: string | null | undefined) =>
  CHANNELS.find(c => c.value === v)?.label ?? 'Other'

export const REPLY_STATUSES = [
  { value: 'none', label: 'No reply recorded' },
  { value: 'awaiting', label: 'Awaiting response' },
  { value: 'replied_positive', label: 'Replied — interested' },
  { value: 'replied_negative', label: 'Replied — not interested' },
  { value: 'bounced', label: 'Bounced / undeliverable' },
] as const
export const replyStatusLabel = (v: string | null | undefined) =>
  REPLY_STATUSES.find(r => r.value === v)?.label ?? 'No reply recorded'

// ---------------------------------------------------------------------------
// Data-quality renderers (migration 0012)
// ---------------------------------------------------------------------------
export const GEO_LABELS: Record<string, string> = {
  confirmed_us: 'US — confirmed',
  likely_us: 'US — likely',
  unverified_us: 'US — unverified',
  non_us: 'Outside the US',
  unknown: 'Location unknown',
}
export const geoLabel = (v: string | null | undefined) => GEO_LABELS[v ?? 'unknown'] ?? 'Location unknown'
export const GEO_TONE: Record<string, BadgeTone> = {
  confirmed_us: 'success', likely_us: 'info', unverified_us: 'warning',
  non_us: 'neutral', unknown: 'neutral',
}

export const ENTITY_LABELS: Record<string, string> = {
  individual_creator: 'Individual creator',
  likely_organization: 'Likely organisation',
  brand: 'Brand',
  business: 'Business',
  institution: 'Institution',
  government: 'Government / agency',
  publisher: 'Publisher / media',
  aggregator: 'Aggregator / feed',
  unclassified: 'Not yet classified',
}

/** Entity types that are definitely not an individual creator. */
export const ORGANISATION_ENTITY_TYPES = [
  'likely_organization', 'brand', 'business', 'institution', 'government',
  'publisher', 'aggregator',
] as const
export const entityLabel = (v: string | null | undefined) => ENTITY_LABELS[v ?? 'unclassified'] ?? 'Unclassified'
export const ENTITY_TONE: Record<string, BadgeTone> = {
  individual_creator: 'success', likely_organization: 'warning', brand: 'warning',
  business: 'warning', institution: 'warning', government: 'warning',
  publisher: 'warning', aggregator: 'warning', unclassified: 'neutral',
}

export const QUALIFICATION_LABELS: Record<string, string> = {
  qualified: 'Qualified',
  candidate: 'Candidate',
  needs_review: 'Needs review',
  cross_platform: 'Cross-platform only',
  awaiting_verification: 'Awaiting Instagram verification',
  disqualified: 'Disqualified',
}
export const qualificationLabel = (v: string | null | undefined) =>
  QUALIFICATION_LABELS[v ?? 'needs_review'] ?? 'Needs review'

/**
 * What each status actually asserts. Shown as a tooltip everywhere the badge
 * appears, because "qualified" previously meant nothing more than "no keyword
 * matched" and the UI must never imply more certainty than the data carries.
 */
export const QUALIFICATION_HELP: Record<string, string> = {
  qualified: 'A person on the team confirmed this is an individual creator.',
  candidate: 'An Instagram record with nothing against it. Nobody has confirmed it is an individual rather than a company or feed.',
  needs_review: 'Classified as an organisation, brand, institution, government account, publisher or feed — or missing the follower count or niche needed to judge it.',
  cross_platform: 'Found on another platform. No Instagram profile is recorded.',
  awaiting_verification: 'Sourced contact-first. The Instagram profile has not been scraped, so followers and niche are provisional.',
  disqualified: 'A person on the team rejected this record.',
}
export const qualificationHelp = (v: string | null | undefined) =>
  QUALIFICATION_HELP[v ?? 'needs_review'] ?? ''

export const QUALIFICATION_TONE: Record<string, BadgeTone> = {
  qualified: 'success', candidate: 'info', needs_review: 'warning',
  cross_platform: 'neutral', awaiting_verification: 'warning', disqualified: 'neutral',
}

export const CONTACT_LABELS: Record<string, string> = {
  complete: 'Email + phone',
  email_only: 'Email only',
  phone_only: 'Phone only',
  none: 'No public contact',
}
export const contactLabel = (v: string | null | undefined) => CONTACT_LABELS[v ?? 'none'] ?? 'No public contact'
export const CONTACT_TONE: Record<string, BadgeTone> = {
  complete: 'success', email_only: 'info', phone_only: 'info', none: 'neutral',
}

/**
 * Which outreach channels are actually usable for this creator.
 *
 * Deliberately NOT "Instagram AND email AND phone". Phone is optional; a
 * creator with a working Instagram profile is reachable by DM whether or not
 * anyone found their email.
 */
export interface ChannelReadiness {
  instagram: boolean
  email: boolean
  phone: boolean
  any: boolean
}
export function channelReadiness(c: {
  platform?: string | null
  profile_url?: string | null
  email?: string | null
  phone?: string | null
  verification_status?: string | null
}): ChannelReadiness {
  const instagram = !!(c.profile_url && /(^|\.)instagram\.com/i.test(hostOf(c.profile_url) ?? ''))
    && c.verification_status !== 'pending_instagram_verification'
  const email = !!c.email?.trim()
  const phone = !!c.phone?.trim()
  return { instagram, email, phone, any: instagram || email || phone }
}

// ---------------------------------------------------------------------------
// Link labelling — read the host, never assume the platform
// ---------------------------------------------------------------------------
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}

const HOST_LABELS: [RegExp, string][] = [
  [/^instagram\.com$/, 'Instagram'],
  [/^(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/^github\.com$/, 'GitHub'],
  [/^(twitter\.com|x\.com)$/, 'X'],
  [/^tiktok\.com$/, 'TikTok'],
  [/^linkedin\.com$/, 'LinkedIn'],
  [/^(facebook\.com|fb\.com)$/, 'Facebook'],
  [/^bsky\.app$/, 'Bluesky'],
  [/^dev\.to$/, 'DEV'],
  [/^(linktr\.ee|beacons\.ai|pillar\.io|bio\.link)$/, 'Link page'],
]

/**
 * Label a URL by the site it actually points at.
 *
 * The catalog holds YouTube channel URLs and GitHub profiles in `profile_url`,
 * and `bio_link` routinely holds YouTube, Facebook and Linktree links. Calling
 * any of those "Instagram" — as the previous UI did — is a lie the user acts on.
 */
export function linkLabelFor(url: string | null | undefined): string {
  const host = hostOf(url)
  if (!host) return 'Link'
  for (const [re, label] of HOST_LABELS) if (re.test(host)) return label
  return host
}

/** True when the URL really is an Instagram profile. */
export function isInstagramUrl(url: string | null | undefined): boolean {
  return hostOf(url) === 'instagram.com'
}

// ---------------------------------------------------------------------------
// Absent-value rendering
// ---------------------------------------------------------------------------
/** Never print 0 for "we don't know". */
export const orNotRecorded = (v: unknown, fmt?: (x: never) => string) =>
  v === null || v === undefined || v === '' ? 'Not recorded' : (fmt ? fmt(v as never) : String(v))

export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never'
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const today = () => new Date().toISOString().slice(0, 10)

/** "3 days overdue" / "due today" / "in 4 days" — from a YYYY-MM-DD date. */
export function dueLabel(date: string | null | undefined): { text: string; tone: BadgeTone } | null {
  if (!date) return null
  const diff = Math.round((new Date(date + 'T00:00:00Z').getTime() - new Date(today() + 'T00:00:00Z').getTime()) / 864e5)
  if (diff < 0) return { text: `${-diff} day${diff === -1 ? '' : 's'} overdue`, tone: 'danger' }
  if (diff === 0) return { text: 'Due today', tone: 'warning' }
  if (diff <= 7) return { text: `Due in ${diff} day${diff === 1 ? '' : 's'}`, tone: 'warning' }
  return { text: `Due ${new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: 'neutral' }
}
