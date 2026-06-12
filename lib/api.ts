'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Influencer, Note, PipelineEntry, Collaboration, Segment, StatsResponse, OverviewResponse } from '@/types/database'

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.json()
}
async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? `${method} ${url} failed: ${res.status}`)
  }
  return res.json()
}

// ---- Influencer list --------------------------------------------------------

export interface InfluencerFilters {
  search?: string
  niche?: string[]
  tier?: string[]
  stage?: string[]
  market?: string[]
  accountType?: string[]
  verifiedOnly?: boolean
  minFollowers?: number
  maxFollowers?: number
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export function filtersToQuery(f: InfluencerFilters): string {
  const p = new URLSearchParams()
  if (f.search) p.set('search', f.search)
  if (f.niche?.length) p.set('niche', f.niche.join(','))
  if (f.tier?.length) p.set('tier', f.tier.join(','))
  if (f.stage?.length) p.set('stage', f.stage.join(','))
  if (f.market?.length) p.set('market', f.market.join(','))
  if (f.accountType?.length) p.set('accountType', f.accountType.join(','))
  if (f.verifiedOnly) p.set('verifiedOnly', 'true')
  if (f.minFollowers != null) p.set('minFollowers', String(f.minFollowers))
  if (f.maxFollowers != null) p.set('maxFollowers', String(f.maxFollowers))
  if (f.sort) p.set('sort', f.sort)
  if (f.order) p.set('order', f.order)
  if (f.page) p.set('page', String(f.page))
  if (f.pageSize) p.set('pageSize', String(f.pageSize))
  return p.toString()
}

export interface InfluencerList {
  rows: Influencer[]
  total: number
  page: number
  pageSize: number
}

export function useInfluencers(filters: InfluencerFilters) {
  const qs = filtersToQuery(filters)
  return useQuery({
    queryKey: ['influencers', qs],
    queryFn: () => get<InfluencerList>(`/api/influencers?${qs}`),
    placeholderData: (prev) => prev,
  })
}

export interface InfluencerDetail {
  influencer: Influencer
  notes: Note[]
  pipeline: PipelineEntry[]
  deals: Collaboration[]
}

export function useInfluencer(id: string | null) {
  return useQuery({
    queryKey: ['influencer', id],
    queryFn: () => get<InfluencerDetail>(`/api/influencers/${id}`),
    enabled: !!id,
  })
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => get<StatsResponse>('/api/stats') })
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => get<OverviewResponse>('/api/overview') })
}

export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: () => get<{ niche: string[]; tier: string[]; market: string[]; account_type: string[] }>('/api/facets'),
    staleTime: Infinity,
  })
}

// ---- Mutations --------------------------------------------------------------

export function useUpdateInfluencer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      send(`/api/influencers/${id}`, 'PATCH', patch),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['influencers'] })
      qc.invalidateQueries({ queryKey: ['influencer', v.id] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      send<{ note: Note }>(`/api/influencers/${id}/notes`, 'POST', { content }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['influencer', v.id] }),
  })
}

export function useDeals(influencerId?: string) {
  return useQuery({
    queryKey: ['deals', influencerId ?? 'all'],
    queryFn: () => get<{ deals: Collaboration[] }>(`/api/deals${influencerId ? `?influencer_id=${influencerId}` : ''}`),
  })
}

export function useAddDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deal: Partial<Collaboration> & { influencer_id: string; title: string }) =>
      send<{ deal: Collaboration }>('/api/deals', 'POST', deal),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['influencer', v.influencer_id] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useUpdateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      send('/api/deals/' + id, 'PATCH', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['influencer'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useSegments() {
  return useQuery({ queryKey: ['segments'], queryFn: () => get<{ segments: Segment[] }>('/api/segments') })
}
export function useAddSegment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: { name: string; filters: unknown }) => send('/api/segments', 'POST', s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }),
  })
}
export function useDeleteSegment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => send(`/api/segments/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }),
  })
}
