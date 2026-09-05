import { CREATOR_VIEWS } from '@/lib/crm-views'

export const CREATOR_VIEW_LIST = CREATOR_VIEWS

export const FOLLOWER_RANGES = [
  { key: '', label: 'Any size', min: undefined as number | undefined, max: undefined as number | undefined },
  { key: 'nano', label: '< 1K', min: 0, max: 1000 },
  { key: 'micro', label: '1K – 10K', min: 1000, max: 10000 },
  { key: 'mid', label: '10K – 50K', min: 10000, max: 50000 },
  { key: 'macro', label: '50K – 100K', min: 50000, max: 100000 },
  { key: 'large', label: '100K – 500K', min: 100000, max: 500000 },
] as const

export type ColumnKey =
  | 'followers' | 'niche' | 'geo' | 'contact' | 'classification'
  | 'qualification' | 'platform' | 'campaigns' | 'verified'

export const CREATOR_COLUMNS: { key: ColumnKey; label: string; default: boolean }[] = [
  { key: 'followers', label: 'Followers', default: true },
  { key: 'niche', label: 'Niche', default: true },
  { key: 'geo', label: 'Geography', default: true },
  { key: 'contact', label: 'Contact', default: true },
  { key: 'classification', label: 'Classification', default: false },
  { key: 'qualification', label: 'Status', default: true },
  { key: 'platform', label: 'Profile link', default: true },
  { key: 'campaigns', label: 'Campaigns', default: true },
  { key: 'verified', label: 'Last verified', default: false },
]
