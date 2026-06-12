import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Stage, Platform, Tier, Priority } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STAGES: Stage[] = [
  'Prospecting','Contacted','Responded','Negotiating',
  'Deal Closed','Live','Completed','Archived'
]

export const STAGE_COLORS: Record<Stage, string> = {
  'Prospecting': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Contacted':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Responded':   'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Negotiating': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Deal Closed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Live':        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Completed':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Archived':    'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500',
}

export const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E1306C',
  tiktok:    '#69C9D0',
  youtube:   '#FF0000',
  twitter:   '#1DA1F2',
  linkedin:  '#0A66C2',
}

// Hex accents per stage — used for the pipeline rail + funnel chart.
export const STAGE_HEX: Record<Stage, string> = {
  'Prospecting': '#94a3b8',
  'Contacted':   '#3b82f6',
  'Responded':   '#8b5cf6',
  'Negotiating': '#f59e0b',
  'Deal Closed': '#10b981',
  'Live':        '#06b6d4',
  'Completed':   '#22c55e',
  'Archived':    '#64748b',
}

export const TIER_STYLES: Record<Tier, string> = {
  A: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  B: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  C: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

export const TIER_HEX: Record<Tier, string> = { A: '#10b981', B: '#0ea5e9', C: '#64748b' }

export const ENG_STYLES: Record<string, string> = {
  high:          'text-emerald-400',
  good:          'text-green-400',
  ok:            'text-amber-400',
  low:           'text-slate-400',
  viral_outlier: 'text-fuchsia-400',
  anomalous:     'text-rose-400',
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  low:    'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

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
