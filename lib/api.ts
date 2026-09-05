'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Member, NotificationRow } from '@/types/database'

/**
 * Workspace administration hooks: team, notifications, audit.
 *
 * Everything to do with clients, products, campaigns, creators, outreach,
 * offers, deliverables and analytics lives in `lib/queries.ts`, which is built
 * on the campaign model. This file is only the surrounding workspace plumbing.
 */

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? `Request failed (${res.status}).`)
  }
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
    throw new Error(payload?.error ?? `Request failed (${res.status}).`)
  }
  return res.json()
}

// ---- Team -------------------------------------------------------------------

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
    mutationFn: ({ id, goal }: { id: string; goal: number }) =>
      send<{ ok: boolean }>(`/api/members/${id}`, 'PATCH', { monthly_goal: goal }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ ok: boolean }>(`/api/members/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['campaign-creators'] })
    },
  })
}

// ---- Notifications ----------------------------------------------------------

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ rows: NotificationRow[]; unread: number }>('/api/notifications'),
    refetchInterval: 30_000,
  })
}

export function useMarkNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => send<{ ok: boolean }>('/api/notifications', 'PATCH', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// ---- Audit ------------------------------------------------------------------

export interface AuditEntry {
  id: string; kind: string; actor: string | null; handle: string | null; detail: string; created_at: string
}

export function useAudit() {
  return useQuery({ queryKey: ['audit'], queryFn: () => get<{ entries: AuditEntry[] }>('/api/audit') })
}

// ---- Sourcing (Operations) --------------------------------------------------

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creators'] })
      qc.invalidateQueries({ queryKey: ['creator-facets'] })
    },
  })
}
