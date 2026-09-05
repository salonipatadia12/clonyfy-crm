/**
 * Creator ↔ campaign fit scoring.
 *
 * This is ARITHMETIC OVER STORED FIELDS. It is not a model, not a prediction and
 * not a confidence. Every point comes from a column the user can see, and every
 * point carries the sentence that explains it, so the UI can show the reasoning
 * rather than a mysterious number.
 *
 * Weights are declared here in one table so the scoring stays auditable.
 */

export interface MatchInput {
  niche: string | null
  follower_count: number | null
  geo_status: string | null
  platform: string | null
  contact_status: string | null
  email: string | null
  phone: string | null
  profile_url: string | null
  entity_type: string | null
  qualification_status: string | null
  verification_status: string | null
}

export interface MatchBrief {
  niches: string[] | null
  minFollowers: number | null
  maxFollowers: number | null
  geo: string | null              // 'us_only' | 'us_preferred' | 'any'
  platforms: string[] | null
  contactPref: string | null      // 'any' | 'email' | 'instagram' | 'phone'
  entityTypes: string[] | null
}

export type ReasonKind = 'positive' | 'neutral' | 'negative' | 'blocker'

export interface MatchReason {
  kind: ReasonKind
  /** Short label for a chip. */
  label: string
  /** Full sentence for the profile view. */
  detail: string
  /** Points this reason contributed. */
  points: number
}

export interface MatchResult {
  /** 0–100, or null when the campaign brief says nothing to score against. */
  score: number | null
  reasons: MatchReason[]
  /** Hard exclusions — the creator does not meet a stated campaign requirement. */
  blockers: MatchReason[]
}

const WEIGHTS = {
  niche: 30,
  followers: 25,
  geography: 20,
  contact: 15,
  platform: 10,
} as const

const fmt = (n: number) => n.toLocaleString()

function nicheScore(c: MatchInput, b: MatchBrief): MatchReason | null {
  if (!b.niches?.length) return null
  const want = b.niches.map(n => n.toLowerCase())
  const have = (c.niche ?? '').toLowerCase()
  if (!have) return {
    kind: 'negative', label: 'Niche unknown', points: 0,
    detail: 'This creator has no niche recorded, so it cannot be matched against the campaign niches.',
  }
  if (want.includes(have)) return {
    kind: 'positive', label: 'Niche match', points: WEIGHTS.niche,
    detail: `Their niche (${have.replace(/_/g, ' ')}) is one of the campaign's target niches.`,
  }
  // Partial credit for a shared token, e.g. web_dev vs software_dev.
  const tokens = new Set(have.split('_'))
  const overlap = want.some(w => w.split('_').some(t => tokens.has(t)))
  if (overlap) return {
    kind: 'neutral', label: 'Adjacent niche', points: Math.round(WEIGHTS.niche * 0.5),
    detail: `Their niche (${have.replace(/_/g, ' ')}) is adjacent to, but not one of, the campaign niches.`,
  }
  return {
    kind: 'negative', label: 'Different niche', points: 0,
    detail: `Their niche (${have.replace(/_/g, ' ')}) is not on the campaign's list.`,
  }
}

function followerScore(c: MatchInput, b: MatchBrief): MatchReason | null {
  if (b.minFollowers == null && b.maxFollowers == null) return null
  if (c.follower_count == null) return {
    kind: 'negative', label: 'Follower count unknown', points: 0,
    detail: 'No follower count is recorded for this creator, so audience size cannot be checked against the brief.',
  }
  const min = b.minFollowers ?? 0
  const max = b.maxFollowers ?? Number.POSITIVE_INFINITY
  const n = c.follower_count
  if (n >= min && n <= max) return {
    kind: 'positive', label: 'Audience size fits', points: WEIGHTS.followers,
    detail: `${fmt(n)} followers is inside the campaign's ${fmt(min)}–${max === Infinity ? 'any' : fmt(max)} range.`,
  }
  // Within 25% of the band still says something useful.
  const near = n < min ? n >= min * 0.75 : n <= max * 1.25
  if (near) return {
    kind: 'neutral', label: 'Near the size band', points: Math.round(WEIGHTS.followers * 0.4),
    detail: `${fmt(n)} followers is just ${n < min ? 'below' : 'above'} the campaign's ${fmt(min)}–${max === Infinity ? 'any' : fmt(max)} range.`,
  }
  return {
    kind: 'negative', label: 'Outside the size band', points: 0,
    detail: `${fmt(n)} followers is outside the campaign's ${fmt(min)}–${max === Infinity ? 'any' : fmt(max)} range.`,
  }
}

function geoScore(c: MatchInput, b: MatchBrief): MatchReason | null {
  if (!b.geo || b.geo === 'any') return null
  const status = c.geo_status ?? 'unknown'
  const strict = b.geo === 'us_only'
  if (status === 'confirmed_us') return {
    kind: 'positive', label: 'US confirmed', points: WEIGHTS.geography,
    detail: 'Their profile location names the United States, so US targeting is confirmed.',
  }
  if (status === 'likely_us') return {
    kind: 'neutral', label: 'US likely', points: Math.round(WEIGHTS.geography * 0.7),
    detail: 'Their location looks like a US place but does not name the country. Worth confirming before you pitch.',
  }
  if (status === 'unverified_us') return {
    kind: 'neutral', label: 'US unverified', points: Math.round(WEIGHTS.geography * 0.35),
    detail: 'They were tagged US by a source country field with no supporting location evidence.',
  }
  if (status === 'non_us') return {
    kind: strict ? 'blocker' : 'negative', label: 'Outside the US', points: 0,
    detail: strict
      ? 'The campaign requires US creators and this profile’s location is outside the United States.'
      : 'Their recorded location is outside the United States.',
  }
  return {
    kind: 'negative', label: 'Location unknown', points: 0,
    detail: 'No geography is recorded for this creator, so the campaign’s US requirement cannot be verified.',
  }
}

function contactScore(c: MatchInput, b: MatchBrief): MatchReason | null {
  const hasEmail = !!c.email?.trim()
  const hasPhone = !!c.phone?.trim()
  const hasInstagram = !!c.profile_url && /instagram\.com/i.test(c.profile_url)
    && c.verification_status !== 'pending_instagram_verification'

  const pref = b.contactPref ?? 'any'
  if (pref === 'email' && !hasEmail) return {
    kind: 'blocker', label: 'No email', points: 0,
    detail: 'The campaign is set to reach creators by email and no public email is recorded.',
  }
  if (pref === 'phone' && !hasPhone) return {
    kind: 'blocker', label: 'No phone', points: 0,
    detail: 'The campaign is set to reach creators by phone and no public phone number is recorded.',
  }
  if (pref === 'instagram' && !hasInstagram) return {
    kind: 'blocker', label: 'No Instagram profile', points: 0,
    detail: 'The campaign is set to reach creators by Instagram DM and this record has no verified Instagram profile.',
  }

  const channels = [hasInstagram && 'Instagram DM', hasEmail && 'email', hasPhone && 'phone'].filter(Boolean) as string[]
  if (!channels.length) return {
    kind: 'negative', label: 'No contact route', points: 0,
    detail: 'No Instagram profile, email or phone is recorded, so there is no way to reach this creator yet.',
  }
  const pts = channels.length >= 2 ? WEIGHTS.contact : Math.round(WEIGHTS.contact * 0.6)
  return {
    kind: 'positive', label: channels.length >= 2 ? 'Multiple contact routes' : 'Contactable', points: pts,
    detail: `Reachable by ${channels.join(' and ')}.`,
  }
}

function platformScore(c: MatchInput, b: MatchBrief): MatchReason | null {
  if (!b.platforms?.length) return null
  const p = c.platform ?? 'instagram'
  if (b.platforms.includes(p)) return {
    kind: 'positive', label: 'Platform match', points: WEIGHTS.platform,
    detail: `They are on ${p}, which the campaign targets.`,
  }
  return {
    kind: 'negative', label: 'Different platform', points: 0,
    detail: `Their catalog record is a ${p} profile; the campaign targets ${b.platforms.join(', ')}.`,
  }
}

function entityCheck(c: MatchInput, b: MatchBrief): MatchReason | null {
  const type = c.entity_type ?? 'unclassified'
  if (b.entityTypes?.length && !b.entityTypes.includes(type)) {
    return {
      kind: 'blocker', label: 'Wrong account type', points: 0,
      detail: `The campaign asks for ${b.entityTypes.join(' or ')} accounts and this record is classified as ${type.replace(/_/g, ' ')}.`,
    }
  }
  if (type === 'likely_organization' || type === 'aggregator') {
    return {
      kind: 'negative', label: 'Not confirmed as a person', points: 0,
      detail: `This record matched ${type === 'aggregator' ? 'aggregator/feed' : 'company/institution'} keywords and has not been reviewed. Confirm it is an individual creator before pitching.`,
    }
  }
  return null
}

/**
 * Score a creator against a campaign brief.
 *
 * Returns `null` for the score when the brief specifies nothing to match on —
 * an empty brief means "we have no criteria", which is different from "0% fit",
 * and the UI must say so rather than print a zero.
 */
export function scoreMatch(creator: MatchInput, brief: MatchBrief): MatchResult {
  const candidates = [
    nicheScore(creator, brief),
    followerScore(creator, brief),
    geoScore(creator, brief),
    contactScore(creator, brief),
    platformScore(creator, brief),
    entityCheck(creator, brief),
  ].filter(Boolean) as MatchReason[]

  const blockers = candidates.filter(r => r.kind === 'blocker')
  const reasons = candidates.filter(r => r.kind !== 'blocker')

  // Only the dimensions the brief actually constrains contribute to the
  // denominator, so a sparse brief does not depress every score.
  let available = 0
  if (brief.niches?.length) available += WEIGHTS.niche
  if (brief.minFollowers != null || brief.maxFollowers != null) available += WEIGHTS.followers
  if (brief.geo && brief.geo !== 'any') available += WEIGHTS.geography
  available += WEIGHTS.contact  // contact readiness always matters for outreach
  if (brief.platforms?.length) available += WEIGHTS.platform

  if (available === WEIGHTS.contact && !brief.niches?.length) {
    // Contact readiness alone is not a "fit" score worth showing as a percentage.
    return { score: null, reasons, blockers }
  }

  const earned = reasons.reduce((s, r) => s + r.points, 0)
  const score = blockers.length ? 0 : Math.round((earned / available) * 100)
  return { score: Math.max(0, Math.min(100, score)), reasons, blockers }
}

/** Reads a campaign row into the brief shape the scorer expects. */
export function briefFromCampaign(c: {
  brief_niches?: string[] | null
  brief_min_followers?: number | null
  brief_max_followers?: number | null
  brief_geo?: string | null
  brief_platforms?: string[] | null
  brief_contact_pref?: string | null
  brief_entity_types?: string[] | null
}): MatchBrief {
  return {
    niches: c.brief_niches ?? null,
    minFollowers: c.brief_min_followers != null ? Number(c.brief_min_followers) : null,
    maxFollowers: c.brief_max_followers != null ? Number(c.brief_max_followers) : null,
    geo: c.brief_geo ?? null,
    platforms: c.brief_platforms ?? null,
    contactPref: c.brief_contact_pref ?? null,
    entityTypes: c.brief_entity_types ?? null,
  }
}

/** True when the brief constrains nothing — the UI should offer to fill it in. */
export function briefIsEmpty(b: MatchBrief): boolean {
  return !b.niches?.length && b.minFollowers == null && b.maxFollowers == null
    && (!b.geo || b.geo === 'any') && !b.platforms?.length
    && (!b.contactPref || b.contactPref === 'any') && !b.entityTypes?.length
}

export function scoreTone(score: number | null): 'success' | 'info' | 'warning' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 75) return 'success'
  if (score >= 50) return 'info'
  return 'warning'
}
