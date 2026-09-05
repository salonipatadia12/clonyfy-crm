'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  Client, Product, Campaign, CampaignCreator, CreatorListResponse, CreatorDetailResponse,
  TodayResponse, TemplateRow, AnalyticsPayload, AnalyticsFilters, OutreachQueue, OutreachRow,
  OfferRow, DeliverableRow,
} from '@/types/campaign'

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    // The API returns a user-facing sentence; surface it rather than a status code.
    throw new Error(payload?.error ?? `Request failed (${res.status}).`)
  }
  return res.json()
}
const get = <T,>(url: string) => req<T>(url)
const post = <T,>(url: string, b: unknown) => req<T>(url, { method: 'POST', body: JSON.stringify(b) })
const patch = <T,>(url: string, b: unknown) => req<T>(url, { method: 'PATCH', body: JSON.stringify(b) })
const del = <T,>(url: string) => req<T>(url, { method: 'DELETE' })

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/**
 * Everything downstream of a relationship change: the board, the campaign
 * rollups, Today, Outreach, Deliverables and Analytics all read the same rows.
 */
function invalidateWork(qc: QueryClient) {
  for (const key of ['today', 'campaigns', 'campaign', 'campaign-creators', 'outreach', 'offers', 'deliverables', 'analytics', 'creators', 'creator']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------
export const useToday = () =>
  useQuery({ queryKey: ['today'], queryFn: () => get<TodayResponse>('/api/today') })

// ---------------------------------------------------------------------------
// Clients & products
// ---------------------------------------------------------------------------
export const useClients = () =>
  useQuery({ queryKey: ['clients'], queryFn: () => get<{ clients: Client[] }>('/api/clients').then(r => r.clients) })

export const useProducts = (clientId?: string) =>
  useQuery({
    queryKey: ['products', clientId ?? 'all'],
    queryFn: () => get<{ products: Product[] }>(`/api/products${qs({ clientId })}`).then(r => r.products),
  })

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<{ client: Client }>('/api/clients', input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['today'] }) },
  })
}
export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch: p }: { id: string; patch: Record<string, unknown> }) => patch<{ client: Client }>(`/api/clients/${id}`, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}
export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/clients/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}
export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<{ product: Product }>('/api/products', input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['today'] }) },
  })
}
export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch: p }: { id: string; patch: Record<string, unknown> }) => patch<{ product: Product }>(`/api/products/${id}`, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}
export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
export const useCampaignList = () =>
  useQuery({ queryKey: ['campaigns'], queryFn: () => get<{ campaigns: Campaign[] }>('/api/campaigns').then(r => r.campaigns) })

export const useCampaignDetail = (id: string | null) =>
  useQuery({
    queryKey: ['campaign', id],
    queryFn: () => get<{ campaign: Campaign; creators: CampaignCreator[] }>(`/api/campaigns/${id}`),
    enabled: !!id,
  })

export function useCreateCampaignV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<{ campaign: Campaign }>('/api/campaigns', input).then(r => r.campaign),
    onSuccess: () => invalidateWork(qc),
  })
}
export function useUpdateCampaignV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch: p }: { id: string; patch: Record<string, unknown> }) =>
      patch<{ campaign: Campaign }>(`/api/campaigns/${id}`, p).then(r => r.campaign),
    onSuccess: () => invalidateWork(qc),
  })
}
export function useDeleteCampaignV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/campaigns/${id}`),
    onSuccess: () => invalidateWork(qc),
  })
}
export function useRescoreCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => post<{ rescored: number }>(`/api/campaigns/${id}/rescore`, {}),
    onSuccess: () => invalidateWork(qc),
  })
}

// ---------------------------------------------------------------------------
// Campaign creators — the relationship
// ---------------------------------------------------------------------------
export const useCampaignCreators = (opts: { campaignId?: string; influencerId?: string; ownerId?: string } = {}) =>
  useQuery({
    queryKey: ['campaign-creators', opts],
    queryFn: () => get<{ creators: CampaignCreator[] }>(`/api/campaign-creators${qs(opts)}`).then(r => r.creators),
    enabled: !!(opts.campaignId || opts.influencerId || opts.ownerId),
  })

export function useAddCreatorsToCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, ...rest }: { campaignId: string; influencerIds: string[]; stage?: string; ownerId?: string | null; source?: string }) =>
      post<{ added: number; alreadyPresent: number; skipped: string[] }>(`/api/campaigns/${campaignId}/creators`, rest),
    onSuccess: () => invalidateWork(qc),
  })
}

export function useUpdateCampaignCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch: p }: { id: string; patch: Record<string, unknown> }) =>
      patch<{ creator: CampaignCreator }>(`/api/campaign-creators/${id}`, p).then(r => r.creator),
    onSuccess: () => invalidateWork(qc),
  })
}

export function useBulkUpdateCampaignCreators() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids: string[]; stage?: string; owner_id?: string | null; next_follow_up?: string | null }) =>
      patch<{ updated: number }>('/api/campaign-creators', input),
    onSuccess: () => invalidateWork(qc),
  })
}

export function useRemoveCampaignCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/campaign-creators/${id}`),
    onSuccess: () => invalidateWork(qc),
  })
}

// ---------------------------------------------------------------------------
// Creators catalog
// ---------------------------------------------------------------------------
export interface CreatorFilters {
  view?: string
  search?: string
  niche?: string
  minFollowers?: number
  maxFollowers?: number
  geoStatus?: string
  platform?: string
  contact?: string
  verification?: string
  entityType?: string
  qualification?: string
  campaignId?: string
  ccStage?: string
  notInCampaignId?: string
  notForClientId?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export const useCreators = (filters: CreatorFilters) =>
  useQuery({
    queryKey: ['creators', filters],
    queryFn: () => get<CreatorListResponse>(`/api/creators${qs(filters as Record<string, string | number | undefined>)}`),
    placeholderData: prev => prev,
  })

export const useCreatorFacets = () =>
  useQuery({
    queryKey: ['creator-facets'],
    queryFn: () => get<{
      niche: { value: string; count: number }[]
      platform: { value: string; count: number }[]
      geo_status: { value: string; count: number }[]
      entity_type: { value: string; count: number }[]
      qualification_status: { value: string; count: number }[]
      total: number
    }>('/api/creators/facets'),
    staleTime: 120_000,
  })

export const useCreator = (id: string | null) =>
  useQuery({
    queryKey: ['creator', id],
    queryFn: () => get<CreatorDetailResponse>(`/api/creators/${id}`),
    enabled: !!id,
  })

export function useReviewCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: string; entity_type?: string; review_state?: string; reason?: string }) =>
      patch<{ creator: unknown }>(`/api/creators/${id}`, rest),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['creators'] }); qc.invalidateQueries({ queryKey: ['creator'] }); qc.invalidateQueries({ queryKey: ['creator-facets'] }) },
  })
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------
export const useOutreach = (opts: { campaignId?: string; queue?: OutreachQueue; ownerId?: string; search?: string } = {}) =>
  useQuery({
    queryKey: ['outreach', opts],
    queryFn: () => get<{ rows: OutreachRow[]; counts: Record<OutreachQueue, number> }>(`/api/outreach${qs(opts)}`),
    placeholderData: prev => prev,
  })

export function useLogOutreach() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<{ activity: unknown }>('/api/outreach', input),
    onSuccess: () => invalidateWork(qc),
  })
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------
export type OfferWithContext = OfferRow & {
  handle: string; full_name: string | null; campaign_id: string; campaign_name: string | null; stage: string
}

export const useOffers = (opts: { campaignId?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ['offers', opts],
    queryFn: () => get<{ offers: OfferWithContext[] }>(`/api/offers${qs(opts)}`).then(r => r.offers),
  })

export function useSaveOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<{ offer: OfferRow }>('/api/offers', input).then(r => r.offer),
    onSuccess: () => invalidateWork(qc),
  })
}

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------
export type DeliverableWithContext = DeliverableRow & {
  handle: string; full_name: string | null; campaign_id: string; campaign_name: string | null
  client_name: string | null; product_name: string | null; owner_name: string | null
}

export const useDeliverables = (opts: { campaignId?: string; ccId?: string; ownerId?: string; view?: string } = {}) =>
  useQuery({
    queryKey: ['deliverables', opts],
    queryFn: () => get<{ deliverables: DeliverableWithContext[] }>(`/api/deliverables${qs(opts)}`).then(r => r.deliverables),
  })

export function useCreateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => post<unknown>('/api/deliverables', input),
    onSuccess: () => invalidateWork(qc),
  })
}
export function useUpdateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch: p }: { id: string; patch: Record<string, unknown> }) =>
      patch<{ deliverable: DeliverableRow }>(`/api/deliverables/${id}`, p).then(r => r.deliverable),
    onSuccess: () => invalidateWork(qc),
  })
}
export function useDeleteDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/deliverables/${id}`),
    onSuccess: () => invalidateWork(qc),
  })
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const useTemplateList = () =>
  useQuery({ queryKey: ['templates'], queryFn: () => get<{ templates: TemplateRow[] }>('/api/templates').then(r => r.templates) })

export function useSaveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Record<string, unknown> & { id?: string }) =>
      id ? patch<{ template: TemplateRow }>(`/api/templates/${id}`, input) : post<{ template: TemplateRow }>('/api/templates', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
export function useDeleteTemplate2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<{ ok: boolean }>(`/api/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export const useAnalyticsV2 = (filters: AnalyticsFilters) =>
  useQuery({
    queryKey: ['analytics', filters],
    queryFn: () => get<AnalyticsPayload>(`/api/analytics${qs(filters as Record<string, string | undefined>)}`),
    placeholderData: prev => prev,
  })
