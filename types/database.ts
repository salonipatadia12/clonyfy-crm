export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin'

// Canonical pipeline stages — lowercase, matching the DB check constraint and
// LOGIC_AND_FLOWS spec. Use stageLabel() (lib/utils) for display.
export type Stage =
  | 'prospecting' | 'contacted' | 'responded' | 'negotiating'
  | 'closed' | 'live' | 'completed' | 'archived'

export type Role = 'admin' | 'member'
export type CommissionType = 'percentage' | 'flat' | 'both'

export type ContactStatus = 'complete' | 'email_only' | 'phone_only' | 'none'
export type VerificationStatus = 'instagram_verified' | 'pending_instagram_verification'

// Influencer catalog row (read-only directory). Engagement/quality/account_type/
// market are intentionally NOT exposed per spec §2/§11.
export interface Influencer {
  id: string
  handle: string
  name: string          // full_name
  follower_count: number | null
  follower_bucket: string | null
  niche: string | null
  country: string | null
  biography: string | null
  bio_link: string | null
  profile_url: string | null
  is_verified: boolean
  email: string | null
  scraped_at: string | null
  // sourcing provenance (migration 0010 — the catalog is no longer Instagram-only):
  platform: string | null
  source: string | null
  location: string | null
  // contact-first sourcing (migration 0011):
  phone: string | null
  phone_type: string | null
  phone_source_url: string | null
  phone_source_label: string | null
  phone_confidence: number | null
  email_type: string | null
  email_source_url: string | null
  email_confidence: number | null
  contact_status: ContactStatus
  verification_status: VerificationStatus
  discovery_route: string | null
  source_anchor: string | null
  identity_confidence: number | null
  // pipeline overlay (computed from the pipeline table for this workspace):
  in_pipeline: boolean
  stage: Stage | null
  pipeline_id: string | null
  assigned_to: string | null
  assigned_name: string | null
}

// A working pipeline row (one per assigned creator).
export interface PipelineRow {
  id: string
  handle: string
  full_name: string | null
  follower_count: number | null
  niche: string | null
  country: string | null
  profile_url: string | null
  biography: string | null
  is_verified: boolean
  stage: Stage
  assigned_to: string | null
  assigned_name: string | null
  assigned_by: string | null
  notes: string | null
  last_touch: string | null
  added_at: string
  added_via: string | null
  reel_url: string | null
  reel_views: number | null
  commission_type: CommissionType | null
  commission_percentage: number | null
  commission_flat: string | null
  next_follow_up: string | null
  campaign_id: string | null
  campaign_name?: string | null
}

export type ActivityAction =
  | 'added_to_pipeline' | 'stage_changed' | 'reel_url_added' | 'notes_updated'
  | 'commission_set' | 'reassigned' | 'assigned' | 'removed_from_pipeline'
  | 'deal_signed' | 'deal_unsigned'

export interface ActivityEvent {
  id: string
  user_id: string | null
  user_name: string | null
  profile_handle: string | null
  profile_name: string | null
  action: ActivityAction
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Assignment {
  id: string
  influencer_handle: string
  assigned_to: string
  assigned_by: string
  assigned_at: string
  status: 'pending' | 'added_to_pipeline'
  pipeline_id: string | null
}

export interface Member {
  id: string
  name: string
  email: string
  role: Role
  invite_accepted: boolean
  last_active: string | null
}

export interface MemberStats extends Member {
  assigned: number
  inPipeline: number
  contacted: number
  responded: number
  videos: number
  monthly_goal: number
  advancedThisMonth: number
}

export interface Comment {
  id: string
  influencer_handle: string
  author_id: string | null
  author_name: string | null
  body: string
  mentions: string[]
  created_at: string
}

export interface NotificationRow {
  id: string
  message: string
  type: string | null
  read: boolean
  created_at: string
}

export interface Template {
  id: string
  name: string
  subject: string | null
  body: string
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface SavedList {
  id: string
  name: string
  filters: Record<string, unknown>
  match_count: number
  last_used: string | null
  created_at: string
}

// ---- Aggregate payloads -----------------------------------------------------

export interface Kpis {
  totalProfiles: number
  inPipeline: number
  contacted: number
  videosGenerated: number
  teamMembers: number   // 0 / hidden for members
}

export interface StatsResponse {
  kpis: Kpis
  byStage: { stage: Stage; count: number }[]
  byNiche: { niche: string; count: number; reach: number }[]
}

export interface NeedsAttentionRow {
  id: string
  handle: string
  full_name: string | null
  stage: Stage
  last_touch: string | null
  assigned_name: string | null
}

export interface FollowUpRow {
  id: string
  handle: string
  full_name: string | null
  stage: Stage
  next_follow_up: string | null
  assigned_name: string | null
}

export interface OverviewResponse extends StatsResponse {
  series: { date: string; activity: number }[]
  deltas: { activity: number; activity7: number }
  feed: ActivityEvent[]
  needsAttention: NeedsAttentionRow[]
  followUpsDue: FollowUpRow[]
}

export interface AnalyticsResponse {
  funnel: { stage: Stage; count: number }[]
  nichePerf: { niche: string; total: number; advanced: number; rate: number }[]
  nicheMix: { niche: string; count: number }[]
  reachByNiche: { niche: string; reach: number }[]
  countryMix: { country: string; count: number }[]
  members?: MemberStats[]   // admin only
}

// ---- Deals (collaborations tracked by video deliverables; no money) ---------
export type DealStatus = 'active' | 'completed' | 'cancelled'
export type ApprovalStatus = 'planned' | 'submitted' | 'approved' | 'posted'

export interface DealVideo {
  id: string
  deal_id: string
  title: string | null
  url: string | null
  views: number | null
  likes: number | null
  comments: number | null
  posted_at: string | null
  due_date: string | null
  approval_status: ApprovalStatus
  created_at: string
}

export interface Deal {
  id: string
  pipeline_id: string | null
  handle: string
  influencer_name: string | null
  owner_id: string | null
  owner_name: string | null
  created_by: string | null
  created_by_name: string | null
  title: string
  status: DealStatus
  signed_at: string | null
  agreement_url: string | null
  campaign_id: string | null
  campaign_name?: string | null
  videos_planned: number
  notes: string | null
  created_at: string
  updated_at: string
  // aggregates (computed):
  videos_posted: number
  total_views: number
  overdue?: number
}

export interface DealDetail extends Deal {
  videos: DealVideo[]
  // Carried from the pipeline row so links do not assume Instagram.
  profile_url?: string | null
}

export interface DealsStats {
  total: number
  active: number
  completed: number
  videosPlanned: number
  videosPosted: number
  totalViews: number
}

export interface DealsResponse {
  deals: Deal[]
  stats: DealsStats
}

// ---- Campaigns (client/brand engagements grouping creators + deals) ---------
export type CampaignStatus = 'planning' | 'active' | 'completed' | 'archived'

export interface Campaign {
  id: string
  name: string
  client: string | null
  brief: string | null
  status: CampaignStatus
  start_date: string | null
  end_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // aggregates (computed):
  pipeline_count: number
  deal_count: number
  signed_count: number
}

export interface CampaignDetail extends Campaign {
  pipeline: PipelineRow[]
  deals: Deal[]
}
