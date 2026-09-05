import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Stage } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STAGES: Stage[] = [
  'prospecting','contacted','responded','negotiating',
  'closed','live','completed','archived',
]

export const STAGE_LABELS: Record<Stage, string> = {
  prospecting: 'Prospecting',
  contacted:   'Contacted',
  responded:   'Responded',
  negotiating: 'Negotiating',
  closed:      'Closed',
  live:        'Live',
  completed:   'Completed',
  archived:    'Archived',
}
export const stageLabel = (s: Stage | null | undefined) => (s ? STAGE_LABELS[s] ?? s : '—')

export const STAGE_COLORS: Record<Stage, string> = {
  prospecting: 'bg-muted text-muted-foreground',
  contacted:   'bg-primary/10 text-primary',
  responded:   'bg-primary/10 text-primary',
  negotiating: 'bg-warning/10 text-warning',
  closed:      'bg-success/10 text-success',
  live:        'bg-success/10 text-success',
  completed:   'bg-success/10 text-success',
  archived:    'bg-muted text-muted-foreground',
}

// Hex accents per stage — used for the pipeline rail + funnel chart.
export const STAGE_HEX: Record<Stage, string> = {
  prospecting: '#94A3B8',
  contacted:   '#3157D5',
  responded:   '#2F6FE0',
  negotiating: '#B7791F',
  closed:      '#0F766E',
  live:        '#0F766E',
  completed:   '#12867D',
  archived:    '#8A94A6',
}

// "Past-contacted" stages — used for niche performance + team metrics (spec §9).
export const ADVANCED_STAGES: Stage[] = ['responded', 'negotiating', 'closed', 'live', 'completed']

export const FOLLOWER_BUCKETS = [
  { key: '', label: 'All sizes', min: undefined, max: undefined },
  { key: '<1K', label: '< 1K', min: 0, max: 1000 },
  { key: '1K-10K', label: '1K – 10K', min: 1000, max: 10000 },
  { key: '10K-50K', label: '10K – 50K', min: 10000, max: 50000 },
  { key: '50K-100K', label: '50K – 100K', min: 50000, max: 100000 },
  { key: '100K-500K', label: '100K – 500K', min: 100000, max: 500000 },
] as const

export const NICHE_LABELS: Record<string, string> = {
  web_dev: 'Web Dev',
  software_dev: 'Software Dev',
  design: 'Design',
  technology: 'Technology',
  digital_marketing: 'Digital Marketing',
  online_business: 'Online Business',
  business_entrepreneurship: 'Business',
}
export const nicheLabel = (n: string | null | undefined) =>
  n ? (NICHE_LABELS[n] ?? n.replace(/_/g, ' ')) : '—'

// Chart series palette, derived from the product accents. Ordered so adjacent
// series stay distinguishable in greyscale as well as in colour.
export const CHART_HEX = ['#3157D5', '#0F766E', '#B7791F', '#5B7CE5', '#3F9E95', '#C9362B', '#8A94A6']
export const NICHE_HEX = CHART_HEX

// CSV export — agencies live in client decks/spreadsheets. Shared so Influencers,
// Pipeline, and Deals all export the same safe way (formula-injection guarded).
export function downloadCsv(filename: string, rows: Record<string, unknown>[], cols: { key: string; label?: string }[]) {
  const esc = (v: unknown) => {
    const cell = String(v ?? '').replace(/"/g, '""')
    const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
    return /[",\n]/.test(safe) ? `"${safe}"` : safe
  }
  const head = cols.map(c => c.label ?? c.key).join(',')
  const body = rows.map(r => cols.map(c => esc(r[c.key])).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export function formatFollowers(n: number | null): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatMoney(n: number | null | undefined, currency = 'USD'): string {
  if (!n) return currency === 'USD' ? '$0' : `0 ${currency}`
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}K`
  return `${sym}${n.toLocaleString()}`
}

export function formatNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

// Only allow http(s) links — scraped URLs are untrusted, so reject
// javascript:, data:, and other unsafe schemes before rendering as href.
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function avatarColor(name: string): string {
  const colors = [
    'bg-primary/10 text-primary',
    'bg-success/10 text-success',
    'bg-warning/10 text-warning',
    'bg-muted text-muted-foreground',
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

// Catalog rows can come from several platforms (migration 0010), so UI must not
// assume Instagram. Falls back to Instagram for legacy rows with no platform.
export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', youtube: 'YouTube', github: 'GitHub',
  bluesky: 'Bluesky', devto: 'DEV', other: 'profile',
}
export function platformLabel(platform?: string | null): string {
  return PLATFORM_LABELS[platform || 'instagram'] ?? 'profile'
}

/** Immutably toggle a value in a Set — used by every multi-select in the UI. */
export function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
