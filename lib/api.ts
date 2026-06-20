'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Influencer, PipelineRow, ActivityEvent, StatsResponse, OverviewResponse,
  AnalyticsResponse, Stage, Member, NotificationRow, Template, SavedList, Comment,
  DealsResponse, DealDetail, DealVideo,
} from '@/types/database'

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

// ---- Influencers (catalog) --------------------------------------------------

export interface InfluencerFilters {
  search?: string
  niche?: string
  country?: string
  minFollowers?: number
  maxFollowers?: number
  verifiedOnly?: boolean
  hideInPipeline?: boolean
  handles?: string[]
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export function filtersToQuery(f: InfluencerFilters): string {
  const p = new URLSearchParams()
  if (f.search) p.set('search', f.search)
  if (f.niche) p.set('niche', f.niche)
  if (f.country) p.set('country', f.country)
  if (f.minFollowers != null) p.set('minFollowers', String(f.minFollowers))
  if (f.maxFollowers != null) p.set('maxFollowers', String(f.maxFollowers))
  if (f.verifiedOnly) p.set('verifiedOnly', 'true')
  if (f.hideInPipeline) p.set('hideInPipeline', 'true')
  if (f.handles?.length) p.set('handles', f.handles.join(','))
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
  influencer: Influencer & Record<string, unknown>
  pipeline: PipelineRow[]
  activity: ActivityEvent[]
}

export function useInfluencer(id: string | null) {
  return useQuery({
    queryKey: ['influencer', id],
    queryFn: () => get<InfluencerDetail>(`/api/influencers/${id}`),
    enabled: !!id,
  })
}

export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: () => get<{ niche: string[]; country: string[]; total: number }>('/api/facets'),
    staleTime: 60_000,
  })
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => get<StatsResponse>('/api/stats') })
}
export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => get<OverviewResponse>('/api/overview') })
}
export function useAnalytics() {
  return useQuery({ queryKey: ['analytics'], queryFn: () => get<AnalyticsResponse>('/api/analytics') })
}

// ---- Pipeline ---------------------------------------------------------------

export interface PipelineFilters {
  stage?: Stage; niche?: string; country?: string; assignedTo?: string; search?: string
}
function pipelineQuery(f: PipelineFilters): string {
  const p = new URLSearchParams()
  if (f.stage) p.set('stage', f.stage)
  if (f.niche) p.set('niche', f.niche)
  if (f.country) p.set('country', f.country)
  if (f.assignedTo) p.set('assignedTo', f.assignedTo)
  if (f.search) p.set('search', f.search)
  return p.toString()
}

export function usePipeline(filters: PipelineFilters = {}) {
  const qs = pipelineQuery(filters)
  return useQuery({
    queryKey: ['pipeline', qs],
    queryFn: () => get<{ rows: PipelineRow[] }>(`/api/pipeline?${qs}`),
    placeholderData: (prev) => prev,
  })
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['influencers'] })
  qc.invalidateQueries({ queryKey: ['pipeline'] })
  qc.invalidateQueries({ queryKey: ['assignments'] })
  qc.invalidateQueries({ queryKey: ['stats'] })
  qc.invalidateQueries({ queryKey: ['overview'] })
  qc.invalidateQueries({ queryKey: ['analytics'] })
}

export interface AddToPipelineResult {
  added: number
  conflicts: { handle: string; assigned_name: string | null; assigned_to: string | null }[]
}

export function useAddToPipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { handles?: string[]; ids?: string[]; stage?: Stage; force?: boolean }) =>
      send<AddToPipelineResult>('/api/pipeline/add', 'POST', input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      send<{ row: PipelineRow }>(`/api/pipeline/${id}`, 'PATCH', patch),
    onSuccess: (_d, v) => { invalidateAll(qc); void v },
  })
}

export function useRemoveFromPipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/pipeline/${id}`, 'DELETE'),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---- Add Creator (admin) ----------------------------------------------------

export interface ProfilePreview {
  handle: string; name: string; profile_url: string; follower_count: number | null; biography: string | null; fetched: boolean
}
export async function fetchProfile(url: string): Promise<ProfilePreview> {
  return get<ProfilePreview>(`/api/fetch-profile?url=${encodeURIComponent(url)}`)
}

export function useAddCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { handle: string; name?: string | null; profile_url?: string | null; follower_count?: number | null; biography?: string | null; niche?: string | null; country?: string | null; addToPipeline?: boolean }) =>
      send<{ influencer: Influencer; created: boolean }>('/api/influencers/add', 'POST', input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useActivity(handle?: string) {
  return useQuery({
    queryKey: ['activity', handle ?? 'all'],
    queryFn: () => get<{ feed: ActivityEvent[] }>(`/api/activity${handle ? `?handle=${handle}` : ''}`),
  })
}

// ---- Team layer (Phase 3) ---------------------------------------------------

interface ReassignmentLogRow {
  id: string; admin_name: string | null; from_user_name: string | null; to_user_name: string | null
  profile_handle: string | null; profile_name: string | null; reason: string | null; created_at: string
}

export function useMembers() {
  return useQuery({
    queryKey: ['members'],
    queryFn: () => get<{ members: Member[]; reassignments: ReassignmentLogRow[] }>('/api/members'),
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; name: string; role?: 'admin' | 'member' }) =>
      send<{ userId: string; email: string; inviteLink: string | null; tempPassword: string | null }>('/api/members', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useSetMemberGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, goal }: { id: string; goal: number }) => send<{ ok: boolean }>(`/api/members/${id}`, 'PATCH', { monthly_goal: goal }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['analytics'] }) },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/members/${id}`, 'DELETE'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['pipeline'] }) },
  })
}

export interface AssignmentRow {
  id: string; influencer_id: string | null; handle: string; full_name: string
  follower_count: number | null; niche: string | null; country: string | null
  profile_url: string | null; is_verified: boolean; assigned_at: string
  status: 'pending' | 'added_to_pipeline'; stage: Stage | null
}

export function useAssignments(memberId?: string, enabled = true) {
  return useQuery({
    queryKey: ['assignments', memberId ?? 'me'],
    queryFn: () => get<{ rows: AssignmentRow[] }>(`/api/assignments${memberId ? `?memberId=${memberId}` : ''}`),
    enabled,
  })
}

export function useAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { memberId: string; handles: string[] }) =>
      send<{ assigned: number }>('/api/assignments', 'POST', input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}

export function useReassign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, toUserId, reason }: { id: string; toUserId: string; reason?: string }) =>
      send<{ ok: boolean }>(`/api/pipeline/${id}/reassign`, 'POST', { toUserId, reason }),
    onSuccess: (_d, v) => { invalidateAll(qc); qc.invalidateQueries({ queryKey: ['members'] }); void v },
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ rows: NotificationRow[]; unread: number }>('/api/notifications'),
    refetchInterval: 10_000,
  })
}

export function useMarkNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => send<{ ok: boolean }>('/api/notifications', 'PATCH', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// ---- Templates + Saved Lists (Phase 5) --------------------------------------

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: () => get<{ templates: Template[] }>('/api/templates') })
}
export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; subject?: string; body: string; tags?: string[] }) => send<{ template: Template }>('/api/templates', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Template> }) => send<{ template: Template }>(`/api/templates/${id}`, 'PATCH', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/templates/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useApifyStatus() {
  return useQuery({
    queryKey: ['apify-status'],
    queryFn: () => get<{ enabled: boolean; remainingUsd: number | null }>('/api/discover'),
    staleTime: 60_000,
  })
}
export function useDiscover() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { niche: string; count?: number; country?: string; minFollowers?: number }) =>
      send<{ discovered: number; enriched: number; added: number; sample: string[] }>('/api/discover', 'POST', input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['influencers'] }); qc.invalidateQueries({ queryKey: ['facets'] }) },
  })
}

export function useComments(handle: string | null) {
  return useQuery({
    queryKey: ['comments', handle],
    queryFn: () => get<{ comments: Comment[] }>(`/api/comments?handle=${handle}`),
    enabled: !!handle,
  })
}
export function useAddComment(handle: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => send<{ comment: Comment }>('/api/comments', 'POST', { handle, body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comments', handle] }); qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}
export function useDeleteComment(handle: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/comments/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', handle] }),
  })
}

export function useSavedLists() {
  return useQuery({ queryKey: ['saved-lists'], queryFn: () => get<{ lists: SavedList[] }>('/api/saved-lists') })
}
export function useSaveList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; filters: Record<string, unknown> }) => send<{ list: SavedList }>('/api/saved-lists', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-lists'] }),
  })
}
export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/saved-lists/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-lists'] }),
  })
}

// ---- Deals ------------------------------------------------------------------

const invalidateDeals = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['deals'] })
  qc.invalidateQueries({ queryKey: ['deal'] })
}

export function useDeals() {
  return useQuery({ queryKey: ['deals'], queryFn: () => get<DealsResponse>('/api/deals') })
}

export interface AuditEntry { id: string; kind: string; actor: string | null; handle: string | null; detail: string; created_at: string }
export function useAudit() {
  return useQuery({ queryKey: ['audit'], queryFn: () => get<{ entries: AuditEntry[] }>('/api/audit') })
}
export function useDeal(id: string | null) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: () => get<{ deal: DealDetail }>(`/api/deals/${id}`).then(r => r.deal),
    enabled: !!id,
  })
}
export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { handle?: string; pipeline_id?: string; title?: string; videos_planned?: number }) => send<{ deal: DealDetail }>('/api/deals', 'POST', input),
    onSuccess: () => invalidateDeals(qc),
  })
}
export function useUpdateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => send<{ deal: DealDetail }>(`/api/deals/${id}`, 'PATCH', patch),
    onSuccess: () => invalidateDeals(qc),
  })
}
export function useDeleteDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/deals/${id}`, 'DELETE'),
    onSuccess: () => invalidateDeals(qc),
  })
}
export function useAddDealVideo(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<DealVideo>) => send<{ video: DealVideo }>(`/api/deals/${dealId}/videos`, 'POST', input),
    onSuccess: () => invalidateDeals(qc),
  })
}
export function useUpdateDealVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DealVideo> }) => send<{ video: DealVideo }>(`/api/deals/videos/${id}`, 'PATCH', patch),
    onSuccess: () => invalidateDeals(qc),
  })
}
export function useDeleteDealVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/deals/videos/${id}`, 'DELETE'),
    onSuccess: () => invalidateDeals(qc),
  })
}
