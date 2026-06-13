export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin'
export type Stage = 'Prospecting' | 'Contacted' | 'Responded' | 'Negotiating' | 'Deal Closed' | 'Live' | 'Completed' | 'Archived'
export type Priority = 'low' | 'medium' | 'high'
export type Tier = 'A' | 'B' | 'C'

// Flat shape returned by the API (mirrors the SQLite `influencers` row).
export interface Influencer {
  id: string
  handle: string
  name: string
  follower_count: number | null
  following_count: number | null
  posts_count: number | null
  engagement_rate: number | null
  avg_likes: number | null
  eng_quality: string | null
  account_type: string | null
  category: string | null
  niche: string | null
  market: string | null
  country_seed: string | null
  is_verified: number
  is_private: number
  quality_tier: Tier | null
  bio_link: string | null
  biography: string | null
  email: string | null
  profile_url: string | null
  avatar_url: string | null
  in_pipeline: number
  stage: Stage
  priority: Priority
  added_via: string | null
  scraped_at: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: number
  influencer_id: string
  content: string
  created_at: string
}

export interface PipelineEntry {
  id: number
  influencer_id: string
  from_stage: Stage | null
  to_stage: Stage
  note: string | null
  changed_at: string
}

export interface Collaboration {
  id: number
  influencer_id: string
  influencer_name?: string
  influencer_handle?: string
  title: string
  status: 'active' | 'completed' | 'cancelled'
  deal_value: number | null
  currency: string
  start_date: string | null
  end_date: string | null
  deliverables: string | null
  reel_url: string | null
  reel_views: number | null
  notes: string | null
  created_at: string
}

// Saved Lists (stored filter combinations) — kept on the `segments` table.
export interface Segment {
  id: number
  name: string
  filters: string
  created_at: string
}

export interface RevenueMonth { month: string; revenue: number; deals: number }
export interface TopDeal {
  id: number
  title: string
  deal_value: number | null
  status: string
  reel_views: number | null
  influencer_name: string
  influencer_handle: string
}

export interface StatsResponse {
  totals: { total: number; reach: number; inPipeline: number; activeDeals: number; videos: number }
  closeRate: number
  byStage: { stage: Stage; count: number; reach: number }[]
  byNiche: { niche: string; count: number; reach: number }[]
  deals: { deal_count: number; total_value: number; revenue_won: number; pipeline_value: number; active_count: number; videos: number }
  revenueByMonth?: RevenueMonth[]
  topDeals?: TopDeal[]
}

export interface ActivityEvent {
  kind: 'added' | 'stage' | 'deal' | 'closed' | 'note' | 'dm'
  ts: string
  detail: string | null
  value: number | null
  name: string | null
  handle: string | null
}

export interface LeaderboardRow {
  id: string
  handle: string
  name: string
  follower_count: number | null
  stage: Stage
  deal_total: number
}

export interface OverviewResponse extends StatsResponse {
  series: { date: string; activity: number; dealValue: number; revenue: number }[]
  deltas: { activity: number; activity7: number; newDeals7: number; revenue7: number }
  leaderboard: LeaderboardRow[]
  feed: ActivityEvent[]
}
