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
  prospecting: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  contacted:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  responded:   'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  negotiating: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closed:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  live:        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  archived:    'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500',
}

// Hex accents per stage — used for the pipeline rail + funnel chart.
export const STAGE_HEX: Record<Stage, string> = {
  prospecting: '#94a3b8',
  contacted:   '#3b82f6',
  responded:   '#8b5cf6',
  negotiating: '#f59e0b',
  closed:      '#10b981',
  live:        '#06b6d4',
  completed:   '#22c55e',
  archived:    '#64748b',
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

export const NICHE_HEX = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#a3e635']

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
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}
