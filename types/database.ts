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
  stage: Stage
  priority: Priority
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
  notes: string | null
  created_at: string
}

export interface Segment {
  id: number
  name: string
  filters: string
  created_at: string
}

export interface StatsResponse {
  totals: { total: number; reach: number; avg_eng: number; tierA: number; activeDeals: number; closedCount: number }
  byStage: { stage: Stage; count: number; reach: number }[]
  byTier: { tier: Tier; count: number }[]
  byNiche: { niche: string; count: number; reach: number }[]
  byEng: { eng_quality: string; count: number }[]
  deals: { deal_count: number; total_value: number; revenue_won: number; pipeline_value: number }
  scatter: { handle: string; x: number; y: number; tier: Tier }[]
}

export interface ActivityEvent {
  kind: 'stage' | 'deal' | 'note'
  ts: string
  detail: string
  extra: string | null
  name: string
  handle: string
}

export interface LeaderboardRow {
  id: string
  handle: string
  name: string
  follower_count: number | null
  engagement_rate: number | null
  quality_tier: Tier | null
  stage: Stage
}

export interface OverviewResponse extends StatsResponse {
  series: { date: string; activity: number; dealValue: number; revenue: number }[]
  conversion: number
  worked: number
  deltas: { activity: number; activity7: number; newDeals7: number; revenue7: number }
  leaderboard: LeaderboardRow[]
  feed: ActivityEvent[]
}
