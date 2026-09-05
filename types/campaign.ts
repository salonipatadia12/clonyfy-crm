/**
 * Types for the client → product → campaign → campaign_creator model
 * (migrations 0013/0014).
 *
 * Numeric fields that can legitimately be unknown are `number | null`. `null`
 * means "not recorded" and must never be rendered as 0.
 */
import type { MatchReason } from '@/lib/match'

export interface Client {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  name: string
  website: string | null
  primary_contact: string | null
  contact_email: string | null
  notes: string | null
  status: 'active' | 'paused' | 'archived'
  created_at: string
  // aggregates
  product_count: number
  campaign_count: number
}

export interface Product {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  client_id: string
  client_name?: string | null
  name: string
  product_url: string | null
  category: string | null
  description: string | null
  target_customer: string | null
  selling_points: string[] | null
  price_note: string | null
  prohibited_claims: string | null
  talking_points: string[] | null
  asset_links: string[] | null
  status: 'active' | 'paused' | 'archived'
  created_at: string
  campaign_count?: number
}

export type CampaignObjective =
  | 'awareness' | 'traffic' | 'leads' | 'sales' | 'ugc' | 'product_launch' | 'custom'

export interface DeliverablePlanItem {
  kind: string
  quantity: number
  platform?: string
  due_offset_days?: number | null
}

export interface CampaignRow {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  name: string
  client: string | null            // legacy free-text label from migration 0009
  client_id: string | null
  client_name: string | null
  product_id: string | null
  product_name: string | null
  owner_id: string | null
  owner_name: string | null
  brief: string | null
  status: 'planning' | 'active' | 'completed' | 'archived'
  start_date: string | null
  end_date: string | null
  objective: CampaignObjective | null
  objective_note: string | null
  brief_niches: string[] | null
  brief_min_followers: number | null
  brief_max_followers: number | null
  brief_geo: string | null
  brief_platforms: string[] | null
  brief_entity_types: string[] | null
  brief_contact_pref: string | null
  brief_creator_target: number | null
  brief_exclusions: string | null
  brief_notes: string | null
  offer_type: string | null
  offer_flat_fee: number | null
  offer_commission_pct: number | null
  offer_gifted_product: string | null
  offer_currency: string | null
  budget_total: number | null
  deliverable_plan: DeliverablePlanItem[]
  usage_rights: string | null
  whitelisting: boolean
  approval_required: boolean
  talking_points: string[] | null
  cta: string | null
  discount_code: string | null
  tracking_url: string | null
  hashtags: string[] | null
  disclosure_required: string | null
  prohibited_language: string | null
  created_at: string
  updated_at: string
}

export interface CampaignStats {
  creators: number
  shortlisted: number
  contacted: number
  replied: number
  agreed: number
  live: number
  completed: number
  rejected: number
  byStage: Record<string, number>
  followUpsOverdue: number
  deliverablesTotal: number
  deliverablesPublished: number
  deliverablesOverdue: number
  awaitingApproval: number
  /** Sum of committed compensation across accepted offers, or null if none recorded. */
  committedSpend: number | null
  currency: string
}

export interface Campaign extends CampaignRow {
  stats: CampaignStats
}

export interface OfferRow {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  campaign_creator_id: string
  offer_type: string
  flat_fee: number | null
  commission_pct: number | null
  gifted_product: string | null
  currency: string
  status: string
  agreed_at: string | null
  agreement_url: string | null
  usage_rights: string | null
  exclusivity: string | null
  whitelisting: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DeliverableRow {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  campaign_creator_id: string
  platform: string
  kind: string
  title: string | null
  brief: string | null
  due_date: string | null
  submitted_url: string | null
  submitted_at: string | null
  approval_state: string
  feedback: string | null
  approved_at: string | null
  published_url: string | null
  published_at: string | null
  views: number | null
  likes: number | null
  comments_count: number | null
  saves: number | null
  clicks: number | null
  conversions: number | null
  created_at: string
}

export interface OutreachActivityRow {
  id: string
  campaign_creator_id: string
  channel: string
  direction: 'outbound' | 'inbound'
  template_id: string | null
  subject: string | null
  body: string | null
  occurred_at: string
  reply_status: string
  next_follow_up: string | null
  notes: string | null
  logged_by: string | null
  logged_by_name?: string | null
}

/** A creator's membership of one campaign. This is what carries the stage. */
export interface CampaignCreator {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  campaign_id: string
  campaign_name?: string | null
  client_name?: string | null
  product_name?: string | null
  influencer_id: string
  handle: string
  stage: string
  owner_id: string | null
  owner_name: string | null
  match_score: number | null
  match_reasons: MatchReason[]
  next_follow_up: string | null
  last_touch: string | null
  notes: string | null
  source: string | null
  added_at: string
  // denormalised creator facts for the board / list
  full_name: string | null
  follower_count: number | null
  niche: string | null
  platform: string | null
  profile_url: string | null
  email: string | null
  phone: string | null
  geo_status: string | null
  contact_status: string | null
  entity_type: string | null
  qualification_status: string | null
  verification_status: string | null
  // relationship aggregates
  offer: OfferRow | null
  deliverables_total: number
  deliverables_published: number
  deliverables_overdue: number
  last_outreach_at: string | null
  last_reply_status: string | null
  outreach_count: number
}

export interface CampaignDetailResponse {
  campaign: Campaign
  creators: CampaignCreator[]
}

// ---------------------------------------------------------------------------
// Creator catalog (rebuilt list payload)
// ---------------------------------------------------------------------------
export interface CreatorRow {
  id: string
  handle: string
  full_name: string | null
  follower_count: number | null
  niche: string | null
  biography: string | null
  bio_link: string | null
  profile_url: string | null
  is_verified: boolean
  platform: string | null
  source: string | null
  location: string | null
  country: string | null
  language_code: string | null
  geo_status: string
  geo_evidence: string | null
  email: string | null
  email_type: string | null
  phone: string | null
  phone_type: string | null
  contact_status: string
  verification_status: string
  entity_type: string
  entity_source: string
  entity_evidence: string | null
  review_state: string
  qualification_status: string
  profile_completeness: number
  last_verified_at: string | null
  scraped_at: string | null
  /** Campaign memberships — a creator can be in several at once. */
  campaigns: { campaign_id: string; campaign_name: string; stage: string; client_name: string | null }[]
}

export interface CreatorListResponse {
  rows: CreatorRow[]
  /** Rows matching the current filters. */
  total: number
  /** Rows in the same view with no filters applied — the denominator. */
  viewTotal: number
  /** Every non-hidden row in the workspace. */
  catalogTotal: number
  page: number
  pageSize: number
}

export interface CreatorReviewRow {
  id: string
  actor_name: string | null
  prev_entity_type: string | null
  new_entity_type: string | null
  prev_review_state: string | null
  new_review_state: string | null
  reason: string | null
  created_at: string
}

export interface CreatorDetailResponse {
  creator: CreatorRow
  memberships: CampaignCreator[]
  /** Manual classification decisions, newest first. */
  reviews: CreatorReviewRow[]
  outreach: (OutreachActivityRow & { campaign_name: string | null })[]
  comments: { id: string; author_name: string | null; body: string; created_at: string }[]
  activity: { id: string; user_name: string | null; action: string; created_at: string; metadata: Record<string, unknown> | null }[]
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------
export interface TodayItem {
  campaign_creator_id: string
  campaign_id: string
  campaign_name: string
  client_name: string | null
  product_name: string | null
  handle: string
  full_name: string | null
  stage: string
  owner_name: string | null
  date: string | null
  detail: string | null
}

export interface TodayDeliverable {
  id: string
  campaign_creator_id: string
  campaign_id: string
  campaign_name: string
  handle: string
  kind: string
  title: string | null
  due_date: string | null
  approval_state: string
  owner_name: string | null
}

export interface CampaignAtRisk {
  id: string
  name: string
  client_name: string | null
  product_name: string | null
  status: string
  end_date: string | null
  reasons: string[]
  creators: number
  target: number | null
}

export interface TodayResponse {
  hasAnyOperationalData: boolean
  counts: {
    clients: number
    products: number
    campaigns: number
    activeCampaigns: number
    creatorsInCampaigns: number
    catalog: number
    templates: number
  }
  followUpsOverdue: TodayItem[]
  followUpsToday: TodayItem[]
  recentReplies: TodayItem[]
  deliverablesDue: TodayDeliverable[]
  awaitingApproval: TodayDeliverable[]
  campaignsAtRisk: CampaignAtRisk[]
  activeCampaigns: {
    id: string; name: string; client_name: string | null; product_name: string | null
    status: string; creators: number; contacted: number; agreed: number; live: number; target: number | null
  }[]
  recentActivity: { id: string; user_name: string | null; action: string; profile_handle: string | null; created_at: string; metadata: Record<string, unknown> | null }[]
}

// ---------------------------------------------------------------------------
// Outreach workspace
// ---------------------------------------------------------------------------
export type OutreachQueue =
  | 'follow_up_due' | 'replied' | 'awaiting_response'
  | 'instagram_ready' | 'email_ready' | 'phone_available' | 'missing_contact'

export interface OutreachQueueCount { queue: OutreachQueue; count: number }

export interface OutreachRow extends CampaignCreator {
  queues: OutreachQueue[]
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export interface FollowUpStep {
  step: number
  delay_days: number
  subject?: string | null
  body: string
}

export interface TemplateRow {
  /** Non-null when this row was created by the demo seed. */
  demo_run_id?: string | null
  id: string
  name: string
  channel: 'instagram_dm' | 'email'
  campaign_id: string | null
  campaign_name?: string | null
  product_id: string | null
  product_name?: string | null
  subject: string | null
  body: string
  follow_ups: FollowUpStep[]
  tags: string[] | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export interface AnalyticsFilters {
  clientId?: string
  productId?: string
  campaignId?: string
  from?: string
  to?: string
}

export interface AnalyticsPayload {
  scope: { campaigns: number; label: string }
  funnel: { stage: string; label: string; count: number }[]
  conversion: { from: string; to: string; label: string; rate: number | null }[]
  outreach: {
    messagesLogged: number
    creatorsContacted: number
    replies: number
    positiveReplies: number
    replyRate: number | null
    positiveRate: number | null
    medianResponseHours: number | null
  }
  agreements: { agreed: number; offersAccepted: number; committedSpend: number | null; currency: string }
  deliverables: { planned: number; submitted: number; approved: number; published: number; overdue: number }
  content: { views: number | null; likes: number | null; comments: number | null; recorded: number; total: number }
  /** Only present when someone actually entered these numbers. */
  performance: { clicks: number | null; conversions: number | null }
  byCampaign: {
    id: string; name: string; client_name: string | null; product_name: string | null
    creators: number; contacted: number; replied: number; agreed: number; live: number
    published: number; views: number | null
  }[]
  byOwner: { id: string | null; name: string; creators: number; contacted: number; replied: number; agreed: number }[]
}
