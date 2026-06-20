import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile, type Profile } from '@/lib/auth'
import { ADVANCED_STAGES, stageLabel } from '@/lib/utils'
import { discoverHandles, enrichProfiles, apifyEnabled, remainingBudgetUsd, isLikelyUS, isFashion } from '@/lib/apify'
import type {
  Influencer, PipelineRow, Stage, ActivityAction, ActivityEvent,
  Kpis, StatsResponse, OverviewResponse, AnalyticsResponse, MemberStats,
} from '@/types/database'

// API routes call requireCtx() first: it validates the session (RLS client) and
// returns the profile + a service-role db handle. All queries below scope by
// profile.workspace_id explicitly and enforce role in code, so workspace-wide
// reads (e.g. in_pipeline) work for members without fighting RLS.
export async function requireCtx(): Promise<{ profile: Profile; db: ReturnType<typeof createAdminClient> } | null> {
  const session = await getProfile()
  if (!session?.profile) return null
  return { profile: session.profile, db: createAdminClient() }
}

type Db = ReturnType<typeof createAdminClient>

// ---- Activity log -----------------------------------------------------------

// Notify every admin in the workspace (except the actor) — used to keep admins
// looped in on what their team is doing.
export async function notifyAdmins(db: Db, profile: Profile, message: string, type = 'activity') {
  const { data: admins } = await db.from('users').select('id')
    .eq('workspace_id', profile.workspace_id).eq('role', 'admin').neq('id', profile.id)
  for (const a of admins ?? []) await createNotification(db, profile.workspace_id, a.id, message, type)
}

// Plain-English phrasing of an activity event, from the actor's perspective.
function activityMessage(actorName: string, entry: {
  action: ActivityAction; profile_handle?: string | null; metadata?: Record<string, unknown> | null
}): string {
  const who = `@${entry.profile_handle ?? 'a creator'}`
  const m = entry.metadata ?? {}
  switch (entry.action) {
    case 'added_to_pipeline':   return `${actorName} added ${who} to the pipeline`
    case 'removed_from_pipeline':return `${actorName} removed ${who} from the pipeline`
    case 'stage_changed':       return `${actorName} moved ${who} to ${stageLabel((m.to as Stage) ?? null)}`
    case 'reel_url_added':       return `${actorName} added a reel link for ${who}`
    case 'notes_updated':        return `${actorName} updated notes on ${who}`
    case 'commission_set':       return `${actorName} set terms on ${who}`
    case 'reassigned':           return `${actorName} reassigned ${who}${m.to ? ` to ${m.to}` : ''}`
    case 'assigned':             return `${actorName} assigned ${who}${m.to ? ` to ${m.to}` : ''}`
    case 'deal_signed':          return `${actorName} signed the deal with ${who}`
    case 'deal_unsigned':        return `${actorName} reopened the agreement for ${who}`
    default:                     return `${actorName} updated ${who}`
  }
}

export async function logActivity(db: Db, profile: Profile, entry: {
  action: ActivityAction
  profile_handle?: string | null
  profile_name?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await db.from('activity_log').insert({
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    user_name: profile.name,
    profile_handle: entry.profile_handle ?? null,
    profile_name: entry.profile_name ?? null,
    action: entry.action,
    metadata: entry.metadata ?? null,
  })
  // Keep admins informed of everything their team members do. Admin actions are
  // not fanned out (admins already see the full activity feed + audit trail).
  if (profile.role === 'member') {
    await notifyAdmins(db, profile, activityMessage(profile.name, entry), 'activity')
  }
}

export async function listActivity(
  db: Db, profile: Profile, opts: { handle?: string; limit?: number } = {},
): Promise<ActivityEvent[]> {
  let q = db.from('activity_log').select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)
  if (opts.handle) q = q.eq('profile_handle', opts.handle)
  // Members see only their own actions (unless scoped to a single profile view).
  else if (profile.role !== 'admin') q = q.eq('user_id', profile.id)
  const { data } = await q
  return (data ?? []) as ActivityEvent[]
}

// ---- Influencers (catalog) --------------------------------------------------

export interface ListParams {
  search?: string
  niche?: string
  country?: string
  minFollowers?: number
  maxFollowers?: number
  verifiedOnly?: boolean
  hideInPipeline?: boolean
  handles?: string[]      // saved-list selection (#6)
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const SORTABLE = new Set(['follower_count', 'full_name', 'handle'])

// Strip PostgREST filter metacharacters so a search term can't break out of the
// .or() expression or inject extra filter clauses.
const sanitizeSearch = (s: string) => s.replace(/[,()*:"\\%]/g, ' ').trim().slice(0, 100)

// Map of handle → {stage, assigned_to, assigned_name} for the whole workspace
// pipeline (used to overlay in_pipeline on the catalog).
async function pipelineOverlay(db: Db, workspaceId: string) {
  const { data } = await db.from('pipeline')
    .select('id, handle, stage, assigned_to, assigned_name')
    .eq('workspace_id', workspaceId)
  const m = new Map<string, { id: string; stage: Stage; assigned_to: string | null; assigned_name: string | null }>()
  for (const r of data ?? []) {
    // keep first; conflict detection handles multi-assignment nuance
    if (!m.has(r.handle)) m.set(r.handle, { id: r.id, stage: r.stage as Stage, assigned_to: r.assigned_to, assigned_name: r.assigned_name })
  }
  return m
}

// Catalog follower ceiling — the scraper occasionally surfaces mega-accounts
// (celebrities/politicians) that aren't real niche creators. Hide anything above
// this from the browsable catalog + counts (non-destructive; rows stay in the DB).
export const CATALOG_FOLLOWER_CEILING = 500_000

export async function listInfluencers(
  db: Db, profile: Profile, p: ListParams,
): Promise<{ rows: Influencer[]; total: number; page: number; pageSize: number }> {
  const overlay = await pipelineOverlay(db, profile.workspace_id)

  const pageSize = Math.min(Math.max(p.pageSize ?? 50, 1), 200)
  const page = Math.max(p.page ?? 1, 1)
  const sort = p.sort && SORTABLE.has(p.sort) ? p.sort : 'follower_count'
  const ascending = p.order === 'asc'

  // hide_in_pipeline: exclude handles already in the workspace pipeline.
  const excluded = p.hideInPipeline ? new Set(overlay.keys()) : null

  let q = db.from('influencers')
    .select('id, handle, full_name, follower_count, follower_bucket, niche, country, biography, bio_link, profile_url, is_verified, email, scraped_at', { count: 'exact' })
    .eq('workspace_id', profile.workspace_id)

  if (p.search) {
    const s = `%${sanitizeSearch(p.search)}%`
    q = q.or(`handle.ilike.${s},full_name.ilike.${s},biography.ilike.${s}`)
  }
  if (p.niche) q = q.eq('niche', p.niche)
  if (p.country) q = q.eq('country', p.country)
  if (p.handles?.length) q = q.in('handle', p.handles.slice(0, 1000))
  if (p.verifiedOnly) q = q.eq('is_verified', true)
  if (typeof p.minFollowers === 'number') q = q.gte('follower_count', p.minFollowers)
  if (typeof p.maxFollowers === 'number') q = q.lt('follower_count', p.maxFollowers)
  q = q.lte('follower_count', CATALOG_FOLLOWER_CEILING)  // hide mega-accounts (spec #7)
  q = q.eq('hidden', false)  // hide soft-hidden rows (e.g. fashion in the design niche)
  if (excluded && excluded.size) q = q.not('handle', 'in', `(${[...excluded].map(h => `"${h}"`).join(',')})`)

  q = q.order(sort, { ascending, nullsFirst: false }).range((page - 1) * pageSize, page * pageSize - 1)

  const { data, count, error } = await q
  if (error) throw new Error(error.message)

  const rows: Influencer[] = (data ?? []).map(r => {
    const ov = overlay.get(r.handle)
    return {
      id: r.id, handle: r.handle, name: r.full_name || r.handle,
      follower_count: r.follower_count, follower_bucket: r.follower_bucket,
      niche: r.niche, country: r.country, biography: r.biography, bio_link: r.bio_link,
      profile_url: r.profile_url, is_verified: !!r.is_verified, email: r.email, scraped_at: r.scraped_at,
      in_pipeline: !!ov, stage: ov?.stage ?? null, pipeline_id: ov?.id ?? null,
      assigned_to: ov?.assigned_to ?? null,
      assigned_name: profile.role === 'admin' ? (ov?.assigned_name ?? null) : (ov ? (ov.assigned_to === profile.id ? ov.assigned_name : 'A teammate') : null),
    }
  })
  return { rows, total: count ?? rows.length, page, pageSize }
}

// Allowlist — never return engagement_rate/eng_quality/account_type/quality_tier/
// market to the client (spec §2/§11 forbid surfacing them).
const INF_DETAIL_COLS = 'id, handle, full_name, follower_count, follower_bucket, niche, country, biography, bio_link, profile_url, is_verified, email, scraped_at'

export async function getInfluencerDetail(db: Db, profile: Profile, idOrHandle: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrHandle)
  const { data: inf } = await db.from('influencers').select(INF_DETAIL_COLS)
    .eq('workspace_id', profile.workspace_id)
    .eq(isUuid ? 'id' : 'handle', idOrHandle).maybeSingle()
  if (!inf) return null
  const handle = inf.handle

  // The pipeline row this user may edit (their own; admin gets any).
  let pq = db.from('pipeline').select('*').eq('workspace_id', profile.workspace_id).eq('handle', handle)
  if (profile.role !== 'admin') pq = pq.eq('assigned_to', profile.id)
  const { data: pipes } = await pq
  const pipeline = (pipes ?? []) as PipelineRow[]

  const activity = await listActivity(db, profile, { handle, limit: 50 })
  return { influencer: inf, pipeline, activity }
}

export async function addInfluencer(db: Db, profile: Profile, input: {
  handle: string; full_name?: string | null; follower_count?: number | null
  niche?: string | null; country?: string | null; biography?: string | null
  profile_url?: string | null; bio_link?: string | null
}) {
  const handle = input.handle.trim().toLowerCase().replace(/^@/, '').replace(/\/$/, '')
  if (!handle) throw new Error('handle required')
  const { data, error } = await db.from('influencers').upsert({
    workspace_id: profile.workspace_id,
    handle,
    full_name: input.full_name?.trim() || handle,
    follower_count: input.follower_count ?? null,
    niche: input.niche ?? null,
    country: input.country ?? null,
    biography: input.biography ?? null,
    bio_link: input.bio_link ?? null,
    profile_url: input.profile_url || `https://www.instagram.com/${handle}/`,
    scraped_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,handle' }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// ---- Scrape-on-demand (Apify) ----------------------------------------------

export async function apifyStatus() {
  return { enabled: apifyEnabled(), remainingUsd: apifyEnabled() ? await remainingBudgetUsd() : null }
}

// Enrich a single handle via Apify and merge into the catalog (admin Add Creator).
export async function enrichAndAdd(db: Db, profile: Profile, handle: string) {
  const [p] = await enrichProfiles([handle])
  return addInfluencer(db, profile, {
    handle,
    full_name: p?.full_name ?? null,
    follower_count: p?.follower_count ?? null,
    biography: p?.biography ?? null,
    country: p?.country ?? null,
    profile_url: p?.profile_url ?? null,
  })
}

// Discover new creators for a niche, enrich them, and add the qualifying ones
// (>= minFollowers, not already in the catalog) to the workspace. Admin only.
export async function discoverAndInsert(
  db: Db, profile: Profile, opts: { niche: string; count?: number; country?: string; minFollowers?: number },
): Promise<{ discovered: number; enriched: number; added: number; sample: string[] }> {
  if (profile.role !== 'admin') throw new Error('admin only')
  const count = Math.min(Math.max(opts.count ?? 25, 1), 60)
  const minFollowers = opts.minFollowers ?? 1000

  const candidates = await discoverHandles(opts.niche, count)
  if (!candidates.length) return { discovered: 0, enriched: 0, added: 0, sample: [] }

  // Drop ones already in this workspace.
  const { data: existing } = await db.from('influencers').select('handle').eq('workspace_id', profile.workspace_id).in('handle', candidates)
  const have = new Set((existing ?? []).map(r => r.handle))
  const fresh = candidates.filter(h => !have.has(h))
  if (!fresh.length) return { discovered: candidates.length, enriched: 0, added: 0, sample: [] }

  const enriched = await enrichProfiles(fresh)
  // US-only targeting: when the caller asks for US, keep only creators with a US
  // business address or a US location in their bio (spec — target US going fwd).
  const wantUS = (opts.country || '').trim().toUpperCase().replace(/\./g, '') === 'US' ||
    (opts.country || '').trim().toLowerCase() === 'united states'
  const geoFiltered = wantUS ? enriched.filter(isLikelyUS) : enriched
  // "design" must be digital/graphic/product design, not fashion designers.
  const nicheFiltered = opts.niche === 'design' ? geoFiltered.filter(p => !isFashion(p)) : geoFiltered
  const now = new Date().toISOString()
  const rows = nicheFiltered
    // Influencer band: above the floor (default 1k) and below the celebrity
    // ceiling (500k) — we want micro/mid influencers, not celebrities.
    .filter(p => (p.follower_count ?? 0) >= minFollowers && (p.follower_count ?? 0) <= CATALOG_FOLLOWER_CEILING)
    .map(p => ({
      workspace_id: profile.workspace_id, handle: p.handle,
      full_name: p.full_name || p.handle, follower_count: p.follower_count,
      niche: opts.niche, country: wantUS ? 'US' : (opts.country || p.country || null),
      biography: p.biography, profile_url: p.profile_url, is_verified: p.is_verified,
      email: p.email, scraped_at: now,
      follower_bucket: bucketFor(p.follower_count),
    }))
  if (!rows.length) return { discovered: candidates.length, enriched: enriched.length, added: 0, sample: [] }

  const { data: inserted, error } = await db.from('influencers')
    .upsert(rows, { onConflict: 'workspace_id,handle', ignoreDuplicates: true }).select('handle')
  if (error) throw new Error(error.message)
  return { discovered: candidates.length, enriched: enriched.length, added: inserted?.length ?? rows.length, sample: rows.slice(0, 5).map(r => r.handle) }
}

function bucketFor(f: number | null): string | null {
  if (f == null) return null
  if (f < 1000) return '<1K'
  if (f < 10000) return '1K-10K'
  if (f < 50000) return '10K-50K'
  if (f < 100000) return '50K-100K'
  if (f < 500000) return '100K-500K'
  return '500K+'
}

// ---- Pipeline ---------------------------------------------------------------

export interface PipelineListParams {
  stage?: Stage; niche?: string; country?: string; assignedTo?: string; search?: string; campaignId?: string
}

export async function listPipeline(db: Db, profile: Profile, p: PipelineListParams = {}): Promise<PipelineRow[]> {
  let q = db.from('pipeline').select('*').eq('workspace_id', profile.workspace_id)
  if (profile.role !== 'admin') q = q.eq('assigned_to', profile.id)
  else if (p.assignedTo) q = q.eq('assigned_to', p.assignedTo)
  if (p.stage) q = q.eq('stage', p.stage)
  if (p.niche) q = q.eq('niche', p.niche)
  if (p.country) q = q.eq('country', p.country)
  if (p.campaignId) q = q.eq('campaign_id', p.campaignId)
  if (p.search) {
    const s = `%${sanitizeSearch(p.search)}%`
    q = q.or(`handle.ilike.${s},full_name.ilike.${s}`)
  }
  q = q.order('last_touch', { ascending: false, nullsFirst: false }).order('added_at', { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PipelineRow[]
  // Decorate with campaign names for display/filter chips.
  const ids = [...new Set(rows.map(r => r.campaign_id).filter(Boolean))] as string[]
  if (ids.length) {
    const { data: camps } = await db.from('campaigns').select('id, name').eq('workspace_id', profile.workspace_id).in('id', ids)
    const nameOf = new Map((camps ?? []).map(c => [c.id, c.name]))
    for (const r of rows) r.campaign_name = r.campaign_id ? (nameOf.get(r.campaign_id) ?? null) : null
  }
  return rows
}

export interface ConflictInfo { handle: string; assigned_name: string | null; assigned_to: string | null }

// Adds creators to the caller's pipeline (self-assign). Detects when a handle is
// already owned by another member (spec §4) and reports it instead of duplicating.
export async function addToPipeline(
  db: Db, profile: Profile, handles: string[], stage: Stage = 'prospecting',
  opts: { force?: boolean } = {},
): Promise<{ added: number; conflicts: ConflictInfo[] }> {
  const clean = [...new Set(handles.map(h => h.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean)
  if (!clean.length) return { added: 0, conflicts: [] }

  // Existing workspace pipeline rows for these handles.
  const { data: existing } = await db.from('pipeline')
    .select('handle, assigned_to, assigned_name')
    .eq('workspace_id', profile.workspace_id)
    .in('handle', clean)
  const byHandle = new Map<string, { assigned_to: string | null; assigned_name: string | null }>()
  for (const r of existing ?? []) byHandle.set(r.handle, r)

  const conflicts: ConflictInfo[] = []
  const toInsert: string[] = []
  for (const h of clean) {
    const ex = byHandle.get(h)
    if (!ex) { toInsert.push(h); continue }
    if (ex.assigned_to === profile.id) continue // already mine
    if (opts.force) { toInsert.push(h); continue } // admin "add anyway"
    conflicts.push({ handle: h, assigned_name: ex.assigned_name, assigned_to: ex.assigned_to })
  }
  if (!toInsert.length) return { added: 0, conflicts }

  // Pull catalog data to denormalize onto the pipeline rows.
  const { data: catalog } = await db.from('influencers')
    .select('handle, full_name, follower_count, niche, country, profile_url, biography, is_verified')
    .eq('workspace_id', profile.workspace_id).in('handle', toInsert)
  const cat = new Map((catalog ?? []).map(c => [c.handle, c]))
  const now = new Date().toISOString()

  const rows = toInsert.map(h => {
    const c = cat.get(h)
    return {
      workspace_id: profile.workspace_id, handle: h,
      full_name: c?.full_name ?? h, follower_count: c?.follower_count ?? null,
      niche: c?.niche ?? null, country: c?.country ?? null, profile_url: c?.profile_url ?? null,
      biography: c?.biography ?? null, is_verified: c?.is_verified ?? false,
      stage, assigned_to: profile.id, assigned_name: profile.name, assigned_by: profile.id,
      assigned_at: now, last_touch: now, added_via: 'manual',
    }
  })
  const { data: inserted, error } = await db.from('pipeline')
    .upsert(rows, { onConflict: 'workspace_id,handle,assigned_to' }).select('id, handle, full_name')
  if (error) throw new Error(error.message)

  for (const r of inserted ?? []) {
    await logActivity(db, profile, { action: 'added_to_pipeline', profile_handle: r.handle, profile_name: r.full_name })
    // Mark any pending assignment for this user → added_to_pipeline (spec §3).
    await db.from('assignments').update({ status: 'added_to_pipeline', pipeline_id: r.id })
      .eq('workspace_id', profile.workspace_id).eq('assigned_to', profile.id).eq('influencer_handle', r.handle)
  }
  return { added: inserted?.length ?? 0, conflicts }
}

const COMMISSION_TYPES = new Set(['percentage', 'flat', 'both'])

export async function updatePipeline(db: Db, profile: Profile, id: string, patch: Record<string, unknown>) {
  // Fetch current row (scoped) to compute deltas + authorize.
  const { data: cur } = await db.from('pipeline').select('*').eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('pipeline row not found')
  if (profile.role !== 'admin' && cur.assigned_to !== profile.id) throw new Error('forbidden')

  const set: Record<string, unknown> = {}
  const logs: { action: ActivityAction; metadata?: Record<string, unknown> }[] = []

  if (typeof patch.stage === 'string' && patch.stage !== cur.stage) {
    set.stage = patch.stage
    logs.push({ action: 'stage_changed', metadata: { from: cur.stage, to: patch.stage } })
  }
  if ('notes' in patch && patch.notes !== cur.notes) {
    set.notes = patch.notes ?? null
    logs.push({ action: 'notes_updated' })
  }
  if ('reel_views' in patch && (Number(patch.reel_views) || null) !== cur.reel_views) {
    set.reel_views = Number(patch.reel_views) || null
  }
  if ('reel_url' in patch && patch.reel_url !== cur.reel_url) {
    set.reel_url = patch.reel_url ?? null
    logs.push({ action: 'reel_url_added', metadata: { reel_url: patch.reel_url } })
  }
  if ('commission_type' in patch) {
    const t = patch.commission_type as string | null
    const next = t && COMMISSION_TYPES.has(t) ? t : null
    const nextPct = patch.commission_percentage != null ? Number(patch.commission_percentage) : null
    const nextFlat = (patch.commission_flat as string) ?? null
    if (next !== cur.commission_type || nextPct !== cur.commission_percentage || nextFlat !== cur.commission_flat) {
      set.commission_type = next; set.commission_percentage = nextPct; set.commission_flat = nextFlat
      logs.push({ action: 'commission_set', metadata: { type: next } })
    }
  }
  if ('next_follow_up' in patch) {
    const next = patch.next_follow_up ? String(patch.next_follow_up) : null
    if (next !== cur.next_follow_up) set.next_follow_up = next
  }
  if ('campaign_id' in patch) {
    const cid = patch.campaign_id ? String(patch.campaign_id) : null
    if (cid !== cur.campaign_id) {
      if (cid) {
        const { data: camp } = await db.from('campaigns').select('id').eq('workspace_id', profile.workspace_id).eq('id', cid).maybeSingle()
        if (!camp) throw new Error('campaign not found')
      }
      set.campaign_id = cid
    }
  }

  // No real change → don't reset the staleness timer.
  if (Object.keys(set).length === 0) return cur as PipelineRow

  set.last_touch = new Date().toISOString()
  const { data: updated, error } = await db.from('pipeline').update(set)
    .eq('workspace_id', profile.workspace_id).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  for (const l of logs) await logActivity(db, profile, { ...l, profile_handle: cur.handle, profile_name: cur.full_name })
  // If someone (e.g. an admin) edited a creator owned by another member, let the
  // owner know their record changed.
  if (cur.assigned_to && cur.assigned_to !== profile.id && logs.length) {
    await createNotification(db, profile.workspace_id, cur.assigned_to, activityMessage(profile.name, { ...logs[0], profile_handle: cur.handle }), 'activity')
  }
  return updated as PipelineRow
}

export async function removeFromPipeline(db: Db, profile: Profile, id: string) {
  const { data: cur } = await db.from('pipeline').select('handle, full_name, assigned_to').eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('pipeline row not found')
  if (profile.role !== 'admin' && cur.assigned_to !== profile.id) throw new Error('forbidden')
  const { error } = await db.from('pipeline').delete().eq('workspace_id', profile.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  await logActivity(db, profile, { action: 'removed_from_pipeline', profile_handle: cur.handle, profile_name: cur.full_name })
  // Removing a creator someone else was working → tell that member.
  if (cur.assigned_to && cur.assigned_to !== profile.id) {
    await createNotification(db, profile.workspace_id, cur.assigned_to, `${profile.name} removed @${cur.handle} from your pipeline`, 'activity')
  }
  return { ok: true }
}

// ---- KPIs / overview / analytics -------------------------------------------

async function pipelineRowsForScope(db: Db, profile: Profile) {
  let q = db.from('pipeline').select('id, handle, full_name, stage, niche, country, reel_url, assigned_to, assigned_name, added_at, last_touch, next_follow_up').eq('workspace_id', profile.workspace_id)
  if (profile.role !== 'admin') q = q.eq('assigned_to', profile.id)
  const { data } = await q
  return data ?? []
}

// Stale contacts that need a follow-up (active stages, no touch in 7+ days).
const STALE_STAGES: Stage[] = ['contacted', 'responded', 'negotiating']
function needsAttention(pipe: Awaited<ReturnType<typeof pipelineRowsForScope>>) {
  const cutoff = Date.now() - 7 * 864e5
  return pipe
    .filter(r => STALE_STAGES.includes(r.stage as Stage) && r.last_touch && new Date(r.last_touch).getTime() < cutoff)
    .sort((a, b) => new Date(a.last_touch!).getTime() - new Date(b.last_touch!).getTime())
    .slice(0, 8)
    .map(r => ({ id: r.id, handle: r.handle, full_name: r.full_name, stage: r.stage as Stage, last_touch: r.last_touch, assigned_name: r.assigned_name }))
}

// Scheduled follow-ups due today or earlier (skip closed/live/completed/archived).
const FOLLOWUP_SKIP: Stage[] = ['closed', 'live', 'completed', 'archived']
function followUpsDue(pipe: Awaited<ReturnType<typeof pipelineRowsForScope>>) {
  const today = new Date().toISOString().slice(0, 10)
  return pipe
    .filter(r => r.next_follow_up && r.next_follow_up <= today && !FOLLOWUP_SKIP.includes(r.stage as Stage))
    .sort((a, b) => (a.next_follow_up! < b.next_follow_up! ? -1 : 1))
    .slice(0, 8)
    .map(r => ({ id: r.id, handle: r.handle, full_name: r.full_name, stage: r.stage as Stage, next_follow_up: r.next_follow_up, assigned_name: r.assigned_name }))
}

export async function getStats(db: Db, profile: Profile): Promise<StatsResponse> {
  const [{ count: totalProfiles }, pipe, members] = await Promise.all([
    db.from('influencers').select('id', { count: 'exact', head: true }).eq('workspace_id', profile.workspace_id),
    pipelineRowsForScope(db, profile),
    profile.role === 'admin'
      // Count only members — admins aren't "team members" (#7).
      ? db.from('users').select('id', { count: 'exact', head: true }).eq('workspace_id', profile.workspace_id).eq('role', 'member')
      : Promise.resolve({ count: 0 } as { count: number }),
  ])

  const byStageMap = new Map<Stage, number>()
  for (const r of pipe) byStageMap.set(r.stage as Stage, (byStageMap.get(r.stage as Stage) ?? 0) + 1)

  const kpis: Kpis = {
    totalProfiles: totalProfiles ?? 0,
    inPipeline: pipe.length,
    contacted: pipe.filter(r => r.stage === 'contacted').length,
    videosGenerated: pipe.filter(r => r.reel_url).length,
    teamMembers: profile.role === 'admin' ? (members.count ?? 0) : 0,
  }

  // Niche composition of the catalog (reach) + niche counts in pipeline.
  const { data: inf } = await db.from('influencers').select('niche, follower_count').eq('workspace_id', profile.workspace_id)
  const nicheMap = new Map<string, { count: number; reach: number }>()
  for (const r of inf ?? []) {
    if (!r.niche) continue
    const cur = nicheMap.get(r.niche) ?? { count: 0, reach: 0 }
    cur.count++; cur.reach += r.follower_count ?? 0
    nicheMap.set(r.niche, cur)
  }

  return {
    kpis,
    byStage: [...byStageMap.entries()].map(([stage, count]) => ({ stage, count })),
    byNiche: [...nicheMap.entries()].map(([niche, v]) => ({ niche, ...v })).sort((a, b) => b.count - a.count),
  }
}

const DAYS = 30
export async function getOverview(db: Db, profile: Profile): Promise<OverviewResponse> {
  const base = await getStats(db, profile)
  const [activity, pipe] = await Promise.all([
    listActivity(db, profile, { limit: 200 }),
    pipelineRowsForScope(db, profile),
  ])

  const today = new Date()
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const idx = new Map(days.map((d, i) => [d, i]))
  const counts = new Array(DAYS).fill(0)
  for (const a of activity) {
    const i = idx.get(a.created_at.slice(0, 10))
    if (i != null) counts[i]++
  }
  const sum = (a: number, b: number) => counts.slice(a, b).reduce((x, y) => x + y, 0)
  const act7 = sum(DAYS - 7, DAYS), prev7 = sum(DAYS - 14, DAYS - 7)
  const pct = prev7 === 0 ? (act7 > 0 ? 100 : 0) : ((act7 - prev7) / prev7) * 100

  return {
    ...base,
    series: days.map((date, i) => ({ date, activity: counts[i] })),
    deltas: { activity: pct, activity7: act7 },
    feed: activity.slice(0, 20),
    needsAttention: needsAttention(pipe),
    followUpsDue: followUpsDue(pipe),
  }
}

// ---- Account self-service ---------------------------------------------------

export async function updateOwnName(db: Db, profile: Profile, name: string) {
  const clean = name.trim()
  if (!clean) throw new Error('name required')
  await db.from('users').update({ name: clean }).eq('id', profile.id)
  // Keep denormalized assignee labels in sync on the pipeline.
  await db.from('pipeline').update({ assigned_name: clean }).eq('workspace_id', profile.workspace_id).eq('assigned_to', profile.id)
  return { ok: true, name: clean }
}

export async function touchLastActive(db: Db, profile: Profile) {
  // Signing in counts as accepting the invite — flip invite_accepted so the team
  // views stop showing an active member as "Invited" (#10).
  await db.from('users').update({ last_active: new Date().toISOString(), invite_accepted: true }).eq('id', profile.id)
}

export async function getAnalytics(db: Db, profile: Profile): Promise<AnalyticsResponse> {
  const pipe = await pipelineRowsForScope(db, profile)
  const { data: inf } = await db.from('influencers').select('niche, follower_count').eq('workspace_id', profile.workspace_id)

  const stageCount = new Map<Stage, number>()
  const nicheTotal = new Map<string, number>()
  const nicheAdvanced = new Map<string, number>()
  const countryCount = new Map<string, number>()
  for (const r of pipe) {
    stageCount.set(r.stage as Stage, (stageCount.get(r.stage as Stage) ?? 0) + 1)
    if (r.niche) {
      nicheTotal.set(r.niche, (nicheTotal.get(r.niche) ?? 0) + 1)
      if (ADVANCED_STAGES.includes(r.stage as Stage)) nicheAdvanced.set(r.niche, (nicheAdvanced.get(r.niche) ?? 0) + 1)
    }
    if (r.country) countryCount.set(r.country, (countryCount.get(r.country) ?? 0) + 1)
  }
  const reachMap = new Map<string, number>()
  for (const r of inf ?? []) if (r.niche) reachMap.set(r.niche, (reachMap.get(r.niche) ?? 0) + (r.follower_count ?? 0))

  const result: AnalyticsResponse = {
    funnel: [...stageCount.entries()].map(([stage, count]) => ({ stage, count })),
    nichePerf: [...nicheTotal.entries()].map(([niche, total]) => {
      const advanced = nicheAdvanced.get(niche) ?? 0
      return { niche, total, advanced, rate: total ? (advanced / total) * 100 : 0 }
    }).sort((a, b) => b.total - a.total),
    nicheMix: [...nicheTotal.entries()].map(([niche, count]) => ({ niche, count })).sort((a, b) => b.count - a.count),
    reachByNiche: [...reachMap.entries()].map(([niche, reach]) => ({ niche, reach })).sort((a, b) => b.reach - a.reach),
    countryMix: [...countryCount.entries()].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
  }
  if (profile.role === 'admin') result.members = await memberStats(db, profile)
  return result
}

export async function getFacets(db: Db, profile: Profile) {
  const { data } = await db.from('influencers').select('niche, country').eq('workspace_id', profile.workspace_id).lte('follower_count', CATALOG_FOLLOWER_CEILING).eq('hidden', false)
  const niche = new Set<string>(), country = new Set<string>()
  for (const r of data ?? []) { if (r.niche) niche.add(r.niche); if (r.country) country.add(r.country) }
  const { count } = await db.from('influencers').select('id', { count: 'exact', head: true }).eq('workspace_id', profile.workspace_id).lte('follower_count', CATALOG_FOLLOWER_CEILING).eq('hidden', false)
  return { niche: [...niche].sort(), country: [...country].sort(), total: count ?? 0 }
}

// ---- Team -------------------------------------------------------------------

// ---- Notifications ----------------------------------------------------------

export async function createNotification(db: Db, workspaceId: string, userId: string, message: string, type: string) {
  await db.from('notifications').insert({ workspace_id: workspaceId, user_id: userId, message, type })
}

export async function listNotifications(db: Db, profile: Profile) {
  const { data } = await db.from('notifications').select('*')
    .eq('workspace_id', profile.workspace_id).eq('user_id', profile.id)
    .order('created_at', { ascending: false }).limit(30)
  const rows = data ?? []
  return { rows, unread: rows.filter(n => !n.read).length }
}

export async function markNotificationsRead(db: Db, profile: Profile, ids?: string[]) {
  let q = db.from('notifications').update({ read: true }).eq('workspace_id', profile.workspace_id).eq('user_id', profile.id)
  if (ids?.length) q = q.in('id', ids)
  await q
  return { ok: true }
}

// ---- Members / invites ------------------------------------------------------

export async function listMembers(db: Db, profile: Profile) {
  const { data } = await db.from('users').select('id, name, email, role, invite_accepted, last_active')
    .eq('workspace_id', profile.workspace_id).order('created_at')
  return (data ?? [])
}

// Invite a member (spec §1). Provisions the account and returns a one-click
// set-password link the admin can share. If Supabase SMTP is configured the
// link is also emailed automatically; the link works regardless.
export async function inviteMember(db: Db, profile: Profile, input: { email: string; name: string; role?: 'admin' | 'member' }, origin?: string) {
  if (profile.role !== 'admin') throw new Error('admin only')
  const email = input.email.trim().toLowerCase()
  const role = input.role === 'admin' ? 'admin' : 'member'
  const tempPassword = 'Clonyfy-' + Math.random().toString(36).slice(2, 10) + 'A1!'

  const { data: created, error } = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })
  let userId = created?.user?.id
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message)
    const { data: list } = await db.auth.admin.listUsers()
    userId = list?.users.find(u => u.email?.toLowerCase() === email)?.id
    if (!userId) throw new Error('email already registered elsewhere')
  }
  if (!userId) throw new Error('could not create user')

  // Guard: never move an account between workspaces. If this user already has a
  // profile in a *different* workspace, reject (upserting by id would overwrite
  // their workspace_id/role and remove their access to the original workspace).
  const { data: existingProfile } = await db.from('users').select('workspace_id').eq('id', userId).maybeSingle()
  if (existingProfile && existingProfile.workspace_id !== profile.workspace_id) {
    throw new Error('This email already belongs to another workspace')
  }

  // Profile row (enforce_admin_cap trigger guards the 2-admin limit).
  const { error: uErr } = await db.from('users').upsert({
    id: userId, workspace_id: profile.workspace_id, name: input.name.trim() || email, email, role, invite_accepted: false,
  }, { onConflict: 'id' })
  if (uErr) throw new Error(uErr.message)

  // A recovery link lets the member set their own password (better than a temp one).
  let inviteLink: string | null = null
  try {
    const redirectTo = origin ? `${origin}/set-password` : undefined
    const { data: link } = await db.auth.admin.generateLink({ type: 'recovery', email, options: redirectTo ? { redirectTo } : undefined })
    inviteLink = link?.properties?.action_link ?? null
  } catch { /* generateLink unavailable → fall back to temp password */ }

  await createNotification(db, profile.workspace_id, userId, `${profile.name} added you to the workspace`, 'invite')
  return { userId, email, inviteLink, tempPassword: created?.user ? tempPassword : null }
}

export async function removeMember(db: Db, profile: Profile, memberId: string) {
  if (profile.role !== 'admin') throw new Error('admin only')
  if (memberId === profile.id) throw new Error('cannot remove yourself')
  const ws = profile.workspace_id

  // Reassign their pipeline to the acting admin so nothing is orphaned.
  await db.from('pipeline').update({ assigned_to: profile.id, assigned_name: profile.name }).eq('workspace_id', ws).eq('assigned_to', memberId)
  await db.from('pipeline').update({ assigned_by: profile.id }).eq('workspace_id', ws).eq('assigned_by', memberId)
  // Reassign their deals too (deals.owner_id references users and would block the
  // delete otherwise).
  await db.from('deals').update({ owner_id: profile.id }).eq('workspace_id', ws).eq('owner_id', memberId)
  // Clear all other FK references to this user (these tables RESTRICT deletes).
  await db.from('notifications').delete().eq('workspace_id', ws).eq('user_id', memberId)
  await db.from('assignments').delete().eq('workspace_id', ws).eq('assigned_to', memberId)
  await db.from('assignments').update({ assigned_by: profile.id }).eq('workspace_id', ws).eq('assigned_by', memberId)
  await db.from('saved_lists').delete().eq('workspace_id', ws).eq('created_by', memberId)
  await db.from('templates').update({ created_by: null }).eq('workspace_id', ws).eq('created_by', memberId)
  await db.from('comments').update({ author_id: null }).eq('workspace_id', ws).eq('author_id', memberId)
  await db.from('activity_log').update({ user_id: null }).eq('workspace_id', ws).eq('user_id', memberId)
  await db.from('reassignment_log').update({ admin_id: null }).eq('workspace_id', ws).eq('admin_id', memberId)
  await db.from('reassignment_log').update({ from_user_id: null }).eq('workspace_id', ws).eq('from_user_id', memberId)
  await db.from('reassignment_log').update({ to_user_id: null }).eq('workspace_id', ws).eq('to_user_id', memberId)

  const { error } = await db.from('users').delete().eq('workspace_id', ws).eq('id', memberId)
  if (error) throw new Error(error.message)
  await db.auth.admin.deleteUser(memberId).catch(() => {})
  return { ok: true }
}

// ---- Assignments ------------------------------------------------------------

// Admin assigns catalog creators to a member (spec §3). Creates assignment rows,
// logs activity, and notifies the member.
export async function assignInfluencers(db: Db, profile: Profile, memberId: string, handles: string[]) {
  if (profile.role !== 'admin') throw new Error('admin only')
  const clean = [...new Set(handles.map(h => h.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean)
  if (!clean.length) return { assigned: 0 }

  const { data: member } = await db.from('users').select('name').eq('workspace_id', profile.workspace_id).eq('id', memberId).maybeSingle()
  if (!member) throw new Error('member not found')

  const { data: cat } = await db.from('influencers').select('handle, full_name').eq('workspace_id', profile.workspace_id).in('handle', clean)
  const nameByHandle = new Map((cat ?? []).map(c => [c.handle, c.full_name]))

  // Any of these handles already in the pipeline? Assigning them to a different
  // member must move the live pipeline row's owner too (otherwise the "In
  // Pipeline · <owner>" badge never changes — the badge reads the pipeline row,
  // not the assignments table). Treat that case as a reassignment. A handle can
  // have more than one pipeline row, so group them all per handle.
  const { data: pipes } = await db.from('pipeline')
    .select('id, handle, full_name, assigned_to').eq('workspace_id', profile.workspace_id).in('handle', clean)
  const pipesByHandle = new Map<string, typeof pipes>()
  for (const p of pipes ?? []) {
    const arr = pipesByHandle.get(p.handle) ?? []
    arr.push(p)
    pipesByHandle.set(p.handle, arr)
  }

  const rows = clean.map(h => ({
    workspace_id: profile.workspace_id, influencer_handle: h, assigned_to: memberId,
    assigned_by: profile.id, status: 'pending' as const,
  }))
  const { error } = await db.from('assignments').insert(rows)
  if (error) throw new Error(error.message)

  const now = new Date().toISOString()
  for (const h of clean) {
    const handleRows = pipesByHandle.get(h) ?? []
    // If the target already owns a pipeline row for this handle, there is
    // nothing to move (and moving another row onto them would collide with the
    // unique(workspace_id, handle, assigned_to) constraint). Otherwise reassign
    // a row owned by someone else.
    const alreadyOwns = handleRows.some(p => p.assigned_to === memberId)
    const toMove = alreadyOwns ? undefined : handleRows.find(p => p.assigned_to !== memberId)
    if (toMove) {
      const fromUserId = toMove.assigned_to
      const { data: fromUser } = fromUserId
        ? await db.from('users').select('name').eq('id', fromUserId).maybeSingle()
        : { data: null }
      const { error: upErr } = await db.from('pipeline').update({ assigned_to: memberId, assigned_name: member.name, last_touch: now })
        .eq('workspace_id', profile.workspace_id).eq('id', toMove.id)
      if (upErr) throw new Error(upErr.message)
      await db.from('reassignment_log').insert({
        workspace_id: profile.workspace_id, admin_id: profile.id, admin_name: profile.name,
        from_user_id: fromUserId, from_user_name: fromUser?.name ?? null,
        to_user_id: memberId, to_user_name: member.name,
        profile_handle: h, profile_name: toMove.full_name ?? nameByHandle.get(h) ?? h, reason: null,
      })
      await logActivity(db, profile, { action: 'reassigned', profile_handle: h, profile_name: toMove.full_name ?? nameByHandle.get(h) ?? h, metadata: { from: fromUser?.name ?? null, to: member.name, reason: null } })
      if (fromUserId && fromUserId !== memberId) await createNotification(db, profile.workspace_id, fromUserId, `@${h} was reassigned to ${member.name}`, 'reassignment')
    } else {
      await logActivity(db, profile, { action: 'assigned', profile_handle: h, profile_name: nameByHandle.get(h) ?? h, metadata: { to: member.name } })
    }
  }
  await createNotification(db, profile.workspace_id, memberId, `${profile.name} assigned you ${clean.length} profile${clean.length > 1 ? 's' : ''}`, 'assignment')
  return { assigned: clean.length }
}

// My Assignments (member) or a specific member's assignments (admin). Joins
// catalog data + current pipeline stage.
export async function listAssignments(db: Db, profile: Profile, memberId?: string) {
  const target = profile.role === 'admin' && memberId ? memberId : profile.id
  const { data: asg } = await db.from('assignments').select('*')
    .eq('workspace_id', profile.workspace_id).eq('assigned_to', target)
    .order('assigned_at', { ascending: false })
  const handles = [...new Set((asg ?? []).map(a => a.influencer_handle))]
  if (!handles.length) return []

  const [{ data: cat }, { data: pipes }] = await Promise.all([
    db.from('influencers').select('handle, full_name, follower_count, niche, country, profile_url, is_verified, id').eq('workspace_id', profile.workspace_id).in('handle', handles),
    db.from('pipeline').select('handle, stage, assigned_to').eq('workspace_id', profile.workspace_id).in('handle', handles),
  ])
  const catBy = new Map((cat ?? []).map(c => [c.handle, c]))
  const stageBy = new Map((pipes ?? []).filter(p => p.assigned_to === target).map(p => [p.handle, p.stage]))

  return (asg ?? []).map(a => {
    const c = catBy.get(a.influencer_handle)
    const stage = stageBy.get(a.influencer_handle) ?? null
    return {
      id: a.id, influencer_id: c?.id ?? null, handle: a.influencer_handle,
      full_name: c?.full_name ?? a.influencer_handle, follower_count: c?.follower_count ?? null,
      niche: c?.niche ?? null, country: c?.country ?? null, profile_url: c?.profile_url ?? null,
      is_verified: !!c?.is_verified, assigned_at: a.assigned_at,
      status: stage ? 'added_to_pipeline' : 'pending', stage,
    }
  })
}

// ---- Reassignment (spec §7) -------------------------------------------------

export async function reassignPipeline(db: Db, profile: Profile, pipelineId: string, toUserId: string, reason?: string) {
  if (profile.role !== 'admin') throw new Error('admin only')
  const { data: row } = await db.from('pipeline').select('*').eq('workspace_id', profile.workspace_id).eq('id', pipelineId).maybeSingle()
  if (!row) throw new Error('pipeline row not found')
  const { data: toUser } = await db.from('users').select('name').eq('workspace_id', profile.workspace_id).eq('id', toUserId).maybeSingle()
  if (!toUser) throw new Error('target member not found')

  const fromUserId = row.assigned_to
  const { data: fromUser } = fromUserId
    ? await db.from('users').select('name').eq('id', fromUserId).maybeSingle()
    : { data: null }

  const now = new Date().toISOString()
  const { error } = await db.from('pipeline').update({ assigned_to: toUserId, assigned_name: toUser.name, last_touch: now })
    .eq('workspace_id', profile.workspace_id).eq('id', pipelineId)
  if (error) throw new Error(error.message)

  await db.from('reassignment_log').insert({
    workspace_id: profile.workspace_id, admin_id: profile.id, admin_name: profile.name,
    from_user_id: fromUserId, from_user_name: fromUser?.name ?? null,
    to_user_id: toUserId, to_user_name: toUser.name,
    profile_handle: row.handle, profile_name: row.full_name, reason: reason ?? null,
  })
  await logActivity(db, profile, { action: 'reassigned', profile_handle: row.handle, profile_name: row.full_name, metadata: { from: fromUser?.name ?? null, to: toUser.name, reason: reason ?? null } })
  await createNotification(db, profile.workspace_id, toUserId, `@${row.handle} was assigned to you by ${profile.name}`, 'reassignment')
  if (fromUserId && fromUserId !== toUserId) await createNotification(db, profile.workspace_id, fromUserId, `@${row.handle} was reassigned to ${toUser.name}`, 'reassignment')
  return { ok: true }
}

export async function listReassignmentLog(db: Db, profile: Profile) {
  if (profile.role !== 'admin') return []
  const { data } = await db.from('reassignment_log').select('*').eq('workspace_id', profile.workspace_id).order('created_at', { ascending: false }).limit(100)
  return data ?? []
}

// Unified audit trail (admin): assignments + reassignments + pipeline add/remove,
// chronological. Powers the Audit page (#3).
export interface AuditEntry {
  id: string
  kind: 'assigned' | 'reassigned' | 'added_to_pipeline' | 'removed_from_pipeline'
  actor: string | null
  handle: string | null
  detail: string
  created_at: string
}
export async function listAuditLog(db: Db, profile: Profile): Promise<AuditEntry[]> {
  if (profile.role !== 'admin') throw new Error('admin only')
  const ws = profile.workspace_id
  const [{ data: users }, { data: asg }, { data: reas }, { data: acts }] = await Promise.all([
    db.from('users').select('id, name').eq('workspace_id', ws),
    db.from('assignments').select('id, influencer_handle, assigned_to, assigned_by, assigned_at').eq('workspace_id', ws).order('assigned_at', { ascending: false }).limit(200),
    db.from('reassignment_log').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(200),
    db.from('activity_log').select('id, user_id, profile_handle, action, created_at').eq('workspace_id', ws).in('action', ['added_to_pipeline', 'removed_from_pipeline']).order('created_at', { ascending: false }).limit(200),
  ])
  const name = new Map((users ?? []).map(u => [u.id, u.name]))
  const entries: AuditEntry[] = []

  for (const a of asg ?? []) entries.push({
    id: `asg-${a.id}`, kind: 'assigned', actor: a.assigned_by ? (name.get(a.assigned_by) ?? null) : null,
    handle: a.influencer_handle, detail: `assigned @${a.influencer_handle} to ${a.assigned_to ? (name.get(a.assigned_to) ?? 'a member') : 'a member'}`,
    created_at: a.assigned_at,
  })
  for (const r of reas ?? []) entries.push({
    id: `reas-${r.id}`, kind: 'reassigned', actor: r.admin_name ?? null, handle: r.profile_handle,
    detail: `moved @${r.profile_handle}${r.from_user_name ? ` from ${r.from_user_name}` : ''} → ${r.to_user_name ?? 'a member'}${r.reason ? ` · ${r.reason}` : ''}`,
    created_at: r.created_at,
  })
  for (const e of acts ?? []) entries.push({
    id: `act-${e.id}`, kind: e.action as AuditEntry['kind'], actor: e.user_id ? (name.get(e.user_id) ?? null) : null, handle: e.profile_handle,
    detail: `${e.action === 'added_to_pipeline' ? 'added' : 'removed'} @${e.profile_handle}${e.action === 'added_to_pipeline' ? ' to' : ' from'} the pipeline`,
    created_at: e.created_at,
  })

  return entries.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 300)
}

// ---- Comments / @mentions ---------------------------------------------------

export async function listComments(db: Db, profile: Profile, handle: string) {
  const { data } = await db.from('comments').select('*')
    .eq('workspace_id', profile.workspace_id).eq('influencer_handle', handle)
    .order('created_at', { ascending: true })
  return data ?? []
}

// Adds a teammate comment. @first-name tokens are matched against workspace
// members → mentioned users get a notification.
export async function addComment(db: Db, profile: Profile, handle: string, body: string) {
  const text = body.trim()
  if (!text) throw new Error('comment is empty')

  const { data: members } = await db.from('users').select('id, name').eq('workspace_id', profile.workspace_id)
  const tokens = new Set((text.match(/@([a-z0-9_.-]+)/gi) ?? []).map(t => t.slice(1).toLowerCase()))
  const mentions = (members ?? []).filter(m => {
    const first = (m.name.split(' ')[0] || '').toLowerCase()
    return m.id !== profile.id && (tokens.has(first) || tokens.has(m.name.toLowerCase().replace(/\s+/g, '')))
  }).map(m => m.id)

  const { data: inf } = await db.from('influencers').select('full_name').eq('workspace_id', profile.workspace_id).eq('handle', handle).maybeSingle()
  const { data, error } = await db.from('comments').insert({
    workspace_id: profile.workspace_id, influencer_handle: handle,
    author_id: profile.id, author_name: profile.name, body: text, mentions,
  }).select().single()
  if (error) throw new Error(error.message)

  for (const uid of mentions) {
    await createNotification(db, profile.workspace_id, uid, `${profile.name} mentioned you on @${handle}${inf?.full_name ? ` (${inf.full_name})` : ''}`, 'mention')
  }
  return data
}

export async function deleteComment(db: Db, profile: Profile, id: string) {
  let q = db.from('comments').delete().eq('workspace_id', profile.workspace_id).eq('id', id)
  if (profile.role !== 'admin') q = q.eq('author_id', profile.id)
  const { error } = await q
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ---- Templates (workspace-shared, spec §5) ----------------------------------

export async function listTemplates(db: Db, profile: Profile) {
  const { data } = await db.from('templates').select('*').eq('workspace_id', profile.workspace_id).order('created_at', { ascending: false })
  return data ?? []
}
export async function createTemplate(db: Db, profile: Profile, input: { name: string; subject?: string; body: string; tags?: string[] }) {
  const { data, error } = await db.from('templates').insert({
    workspace_id: profile.workspace_id, created_by: profile.id,
    name: input.name, subject: input.subject ?? null, body: input.body, tags: input.tags ?? null,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}
export async function updateTemplate(db: Db, profile: Profile, id: string, patch: { name?: string; subject?: string; body?: string; tags?: string[] }) {
  const { data, error } = await db.from('templates').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('workspace_id', profile.workspace_id).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data
}
export async function deleteTemplate(db: Db, profile: Profile, id: string) {
  const { error } = await db.from('templates').delete().eq('workspace_id', profile.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ---- Saved lists (per-user filter state, spec §3) ---------------------------

// rangeKey -> follower bounds, mirroring FOLLOWER_BUCKETS in lib/utils.ts.
const SAVED_RANGES: Record<string, { min?: number; max?: number }> = {
  '<1K': { min: 0, max: 1000 }, '1K-10K': { min: 1000, max: 10000 },
  '10K-50K': { min: 10000, max: 50000 }, '50K-100K': { min: 50000, max: 100000 },
  '100K-500K': { min: 100000, max: 500000 }, '500K+': { min: 500000 },
}

// Count catalog rows matching a saved list's stored filters (spec §3 — show
// each saved view's live size). Mirrors the filter logic in listInfluencers.
async function countSavedListMatches(db: Db, workspaceId: string, filters: Record<string, unknown>): Promise<number> {
  // Explicit-selection list (#6): count is just how many of those handles exist.
  if (Array.isArray(filters.handles)) {
    const handles = (filters.handles as unknown[]).map(String)
    if (!handles.length) return 0
    const { count } = await db.from('influencers').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).in('handle', handles.slice(0, 1000))
    return count ?? 0
  }
  let q = db.from('influencers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
  const search = typeof filters.search === 'string' ? filters.search.trim() : ''
  if (search) {
    const s = `%${sanitizeSearch(search)}%`
    q = q.or(`handle.ilike.${s},full_name.ilike.${s},biography.ilike.${s}`)
  }
  if (filters.niche) q = q.eq('niche', filters.niche)
  if (filters.country) q = q.eq('country', filters.country)
  if (filters.verifiedOnly) q = q.eq('is_verified', true)
  const range = typeof filters.rangeKey === 'string' ? SAVED_RANGES[filters.rangeKey] : undefined
  if (range) {
    if (typeof range.min === 'number') q = q.gte('follower_count', range.min)
    if (typeof range.max === 'number') q = q.lt('follower_count', range.max)
  }
  const { count } = await q
  return count ?? 0
}

export async function listSavedLists(db: Db, profile: Profile) {
  const { data } = await db.from('saved_lists').select('*')
    .eq('workspace_id', profile.workspace_id).eq('created_by', profile.id).order('created_at', { ascending: false })
  const lists = data ?? []
  // Recompute match_count on load — filters match a moving catalog, so the
  // stored value goes stale as creators are added/scraped.
  return Promise.all(lists.map(async l => ({
    ...l,
    match_count: await countSavedListMatches(db, profile.workspace_id, (l.filters ?? {}) as Record<string, unknown>),
  })))
}
export async function createSavedList(db: Db, profile: Profile, input: { name: string; filters: Record<string, unknown> }) {
  const { data, error } = await db.from('saved_lists').insert({
    workspace_id: profile.workspace_id, created_by: profile.id, name: input.name, filters: input.filters,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}
export async function deleteSavedList(db: Db, profile: Profile, id: string) {
  const { error } = await db.from('saved_lists').delete()
    .eq('workspace_id', profile.workspace_id).eq('created_by', profile.id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function memberStats(db: Db, profile: Profile): Promise<MemberStats[]> {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const [{ data: members }, { data: pipe }, { data: asg }, { data: acts }] = await Promise.all([
    db.from('users').select('id, name, email, role, invite_accepted, last_active, monthly_goal').eq('workspace_id', profile.workspace_id).order('created_at'),
    db.from('pipeline').select('handle, assigned_to, stage, reel_url').eq('workspace_id', profile.workspace_id),
    db.from('assignments').select('assigned_to').eq('workspace_id', profile.workspace_id),
    db.from('activity_log').select('user_id, profile_handle, metadata').eq('workspace_id', profile.workspace_id).eq('action', 'stage_changed').gte('created_at', monthStart.toISOString()),
  ])

  // Credit a stage-advance to the contact's current owner, not whoever clicked
  // it (an admin can advance a member's contact).
  const ownerByHandle = new Map<string, string>()
  for (const p of pipe ?? []) if (p.assigned_to) ownerByHandle.set(p.handle, p.assigned_to)
  const advancedBy = new Map<string, number>()
  for (const a of acts ?? []) {
    const to = (a.metadata as { to?: string } | null)?.to
    if (!to || !(to === 'contacted' || ADVANCED_STAGES.includes(to as Stage))) continue
    const owner = (a.profile_handle && ownerByHandle.get(a.profile_handle)) || a.user_id
    if (owner) advancedBy.set(owner, (advancedBy.get(owner) ?? 0) + 1)
  }

  return (members ?? []).map(m => {
    const mine = (pipe ?? []).filter(p => p.assigned_to === m.id)
    return {
      id: m.id, name: m.name, email: m.email, role: m.role, invite_accepted: m.invite_accepted, last_active: m.last_active,
      assigned: (asg ?? []).filter(a => a.assigned_to === m.id).length,
      inPipeline: mine.length,
      contacted: mine.filter(p => ADVANCED_STAGES.includes(p.stage as Stage) || p.stage === 'contacted').length,
      responded: mine.filter(p => ADVANCED_STAGES.includes(p.stage as Stage)).length,
      videos: mine.filter(p => p.reel_url).length,
      monthly_goal: m.monthly_goal ?? 0,
      advancedThisMonth: advancedBy.get(m.id) ?? 0,
    }
  })
}

export async function setMemberGoal(db: Db, profile: Profile, memberId: string, goal: number) {
  if (profile.role !== 'admin') throw new Error('admin only')
  await db.from('users').update({ monthly_goal: Math.max(0, Math.floor(goal)) }).eq('workspace_id', profile.workspace_id).eq('id', memberId)
  return { ok: true }
}

// ---- Deals (collaborations tracked by video deliverables; no money) ---------

const DEAL_COLS = 'id, pipeline_id, handle, influencer_name, owner_id, created_by, title, status, signed_at, agreement_url, campaign_id, videos_planned, notes, created_at, updated_at'
const DEAL_VIDEO_COLS = 'id, deal_id, title, url, views, likes, comments, posted_at, due_date, approval_status, created_at'
const VALID_APPROVAL = new Set(['planned', 'submitted', 'approved', 'posted'])

// Admins see the whole workspace's deals; members see the ones they own.
export async function listDeals(db: Db, profile: Profile) {
  let q = db.from('deals').select(DEAL_COLS).eq('workspace_id', profile.workspace_id)
  if (profile.role !== 'admin') q = q.eq('owner_id', profile.id)
  const { data: deals, error } = await q.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = deals ?? []

  const [{ data: vids }, { data: users }, { data: camps }] = await Promise.all([
    db.from('deal_videos').select('deal_id, views, due_date, approval_status').eq('workspace_id', profile.workspace_id),
    db.from('users').select('id, name').eq('workspace_id', profile.workspace_id),
    db.from('campaigns').select('id, name').eq('workspace_id', profile.workspace_id),
  ])
  const userName = new Map((users ?? []).map(u => [u.id, u.name]))
  const campName = new Map((camps ?? []).map(c => [c.id, c.name]))
  const today = new Date().toISOString().slice(0, 10)
  const agg = new Map<string, { posted: number; views: number; overdue: number }>()
  for (const v of vids ?? []) {
    const a = agg.get(v.deal_id) ?? { posted: 0, views: 0, overdue: 0 }
    a.posted += 1; a.views += v.views ?? 0
    if (v.due_date && v.due_date <= today && v.approval_status !== 'posted') a.overdue += 1
    agg.set(v.deal_id, a)
  }

  const out = rows.map(d => ({
    ...d,
    owner_name: d.owner_id ? (userName.get(d.owner_id) ?? null) : null,
    created_by_name: d.created_by ? (userName.get(d.created_by) ?? null) : null,
    campaign_name: d.campaign_id ? (campName.get(d.campaign_id) ?? null) : null,
    videos_posted: agg.get(d.id)?.posted ?? 0,
    total_views: agg.get(d.id)?.views ?? 0,
    overdue: agg.get(d.id)?.overdue ?? 0,
  }))

  const stats = {
    total: out.length,
    active: out.filter(d => d.status === 'active').length,
    completed: out.filter(d => d.status === 'completed').length,
    videosPlanned: out.reduce((s, d) => s + (d.videos_planned ?? 0), 0),
    videosPosted: out.reduce((s, d) => s + d.videos_posted, 0),
    totalViews: out.reduce((s, d) => s + d.total_views, 0),
  }
  return { deals: out, stats }
}

export async function getDeal(db: Db, profile: Profile, id: string) {
  const { data: d } = await db.from('deals').select(DEAL_COLS).eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!d) throw new Error('deal not found')
  if (profile.role !== 'admin' && d.owner_id !== profile.id) throw new Error('forbidden')
  const [{ data: vids }, { data: people }, { data: camp }] = await Promise.all([
    db.from('deal_videos').select(DEAL_VIDEO_COLS)
      .eq('workspace_id', profile.workspace_id).eq('deal_id', id).order('created_at', { ascending: true }),
    db.from('users').select('id, name').eq('workspace_id', profile.workspace_id),
    d.campaign_id ? db.from('campaigns').select('name').eq('workspace_id', profile.workspace_id).eq('id', d.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const nameOf = new Map((people ?? []).map(u => [u.id, u.name]))
  const videos = vids ?? []
  return {
    ...d,
    owner_name: d.owner_id ? (nameOf.get(d.owner_id) ?? null) : null,
    created_by_name: d.created_by ? (nameOf.get(d.created_by) ?? null) : null,
    campaign_name: (camp as { name?: string } | null)?.name ?? null,
    videos,
    videos_posted: videos.length,
    total_views: videos.reduce((s, v) => s + (v.views ?? 0), 0),
  }
}

// Create a deal from a creator already in the pipeline. Owner defaults to that
// creator's pipeline owner (admins can spin one up for a teammate's contact).
// A handle can have multiple pipeline rows (admin "Add anyway"), so prefer an
// explicit pipeline_id and otherwise pick the caller's own row (or the first).
export async function createDeal(db: Db, profile: Profile, input: { handle?: string; pipeline_id?: string; title?: string; videos_planned?: number }) {
  let q = db.from('pipeline').select('id, handle, full_name, assigned_to').eq('workspace_id', profile.workspace_id)
  if (input.pipeline_id) {
    q = q.eq('id', input.pipeline_id)
  } else if (input.handle) {
    q = q.eq('handle', input.handle.trim().replace(/^@/, ''))
  } else {
    throw new Error('handle or pipeline_id required')
  }
  const { data: rows } = await q
  const candidates = rows ?? []
  if (candidates.length === 0) throw new Error('Add this creator to your pipeline before creating a deal')
  // Disambiguate: caller's own row first, else the first row.
  const pipe = candidates.find(r => r.assigned_to === profile.id) ?? candidates[0]
  if (profile.role !== 'admin' && pipe.assigned_to !== profile.id) throw new Error('forbidden')

  // Idempotent: if a deal already exists for this pipeline row, return it rather
  // than creating a duplicate. Lets the "you closed a lead → create the deal"
  // prompt fire safely without ever doubling up.
  const { data: existing } = await db.from('deals').select(DEAL_COLS)
    .eq('workspace_id', profile.workspace_id).eq('pipeline_id', pipe.id).maybeSingle()
  if (existing) return existing

  const { data, error } = await db.from('deals').insert({
    workspace_id: profile.workspace_id,
    pipeline_id: pipe.id,
    handle: pipe.handle,
    influencer_name: pipe.full_name,
    owner_id: pipe.assigned_to ?? profile.id,
    created_by: profile.id,
    title: input.title?.trim() || 'Collaboration',
    videos_planned: Math.max(1, Math.floor(input.videos_planned ?? 1)),
  }).select(DEAL_COLS).single()
  if (error) throw new Error(error.message)
  await logActivity(db, profile, { action: 'added_to_pipeline', profile_handle: pipe.handle, profile_name: pipe.full_name, metadata: { deal: true } })
  return data
}

export async function updateDeal(db: Db, profile: Profile, id: string, patch: Record<string, unknown>) {
  const { data: cur } = await db.from('deals').select('owner_id, handle, influencer_name, signed_at, campaign_id').eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('deal not found')
  if (profile.role !== 'admin' && cur.owner_id !== profile.id) throw new Error('forbidden')
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof patch.title === 'string') set.title = patch.title.trim() || 'Collaboration'
  if (patch.status === 'active' || patch.status === 'completed' || patch.status === 'cancelled') set.status = patch.status
  if (patch.videos_planned != null) set.videos_planned = Math.max(0, Math.floor(Number(patch.videos_planned)))
  if ('notes' in patch) set.notes = patch.notes ? String(patch.notes) : null
  // Signing — a boolean flag from the client; the server owns the timestamp.
  let signTransition: 'signed' | 'unsigned' | null = null
  if ('signed' in patch) {
    if (patch.signed) { set.signed_at = cur.signed_at ?? new Date().toISOString(); if (!cur.signed_at) signTransition = 'signed' }
    else { set.signed_at = null; if (cur.signed_at) signTransition = 'unsigned' }
  }
  if ('agreement_url' in patch) set.agreement_url = patch.agreement_url ? String(patch.agreement_url).trim() : null
  // Campaign tagging (validate the campaign belongs to this workspace).
  if ('campaign_id' in patch) {
    const cid = patch.campaign_id ? String(patch.campaign_id) : null
    if (cid) {
      const { data: camp } = await db.from('campaigns').select('id').eq('workspace_id', profile.workspace_id).eq('id', cid).maybeSingle()
      if (!camp) throw new Error('campaign not found')
    }
    set.campaign_id = cid
  }
  const { data, error } = await db.from('deals').update(set).eq('workspace_id', profile.workspace_id).eq('id', id).select(DEAL_COLS).single()
  if (error) throw new Error(error.message)
  if (signTransition) {
    await logActivity(db, profile, { action: signTransition === 'signed' ? 'deal_signed' : 'deal_unsigned', profile_handle: cur.handle, profile_name: cur.influencer_name })
  }
  return data
}

export async function deleteDeal(db: Db, profile: Profile, id: string) {
  const { data: cur } = await db.from('deals').select('owner_id').eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('deal not found')
  if (profile.role !== 'admin' && cur.owner_id !== profile.id) throw new Error('forbidden')
  const { error } = await db.from('deals').delete().eq('workspace_id', profile.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function assertDealAccess(db: Db, profile: Profile, dealId: string) {
  const { data: d } = await db.from('deals').select('owner_id').eq('workspace_id', profile.workspace_id).eq('id', dealId).maybeSingle()
  if (!d) throw new Error('deal not found')
  if (profile.role !== 'admin' && d.owner_id !== profile.id) throw new Error('forbidden')
}

export async function addDealVideo(db: Db, profile: Profile, dealId: string, input: { url?: string; title?: string; views?: number; likes?: number; comments?: number; posted_at?: string; due_date?: string; approval_status?: string }) {
  await assertDealAccess(db, profile, dealId)
  const num = (v: unknown) => (v == null || v === '' ? null : Math.max(0, Math.floor(Number(v))))
  const { data, error } = await db.from('deal_videos').insert({
    workspace_id: profile.workspace_id, deal_id: dealId,
    title: input.title?.trim() || null,
    url: input.url?.trim() || null,
    views: num(input.views), likes: num(input.likes), comments: num(input.comments),
    posted_at: input.posted_at || null,
    due_date: input.due_date || null,
    approval_status: VALID_APPROVAL.has(input.approval_status ?? '') ? input.approval_status : 'planned',
  }).select(DEAL_VIDEO_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateDealVideo(db: Db, profile: Profile, videoId: string, patch: Record<string, unknown>) {
  const { data: v } = await db.from('deal_videos').select('deal_id').eq('workspace_id', profile.workspace_id).eq('id', videoId).maybeSingle()
  if (!v) throw new Error('video not found')
  await assertDealAccess(db, profile, v.deal_id)
  const num = (x: unknown) => (x == null || x === '' ? null : Math.max(0, Math.floor(Number(x))))
  const set: Record<string, unknown> = {}
  if ('title' in patch) set.title = patch.title ? String(patch.title) : null
  if ('url' in patch) set.url = patch.url ? String(patch.url) : null
  if ('views' in patch) set.views = num(patch.views)
  if ('likes' in patch) set.likes = num(patch.likes)
  if ('comments' in patch) set.comments = num(patch.comments)
  if ('posted_at' in patch) set.posted_at = patch.posted_at ? String(patch.posted_at) : null
  if ('due_date' in patch) set.due_date = patch.due_date ? String(patch.due_date) : null
  if ('approval_status' in patch && VALID_APPROVAL.has(String(patch.approval_status))) set.approval_status = patch.approval_status
  const { data, error } = await db.from('deal_videos').update(set).eq('workspace_id', profile.workspace_id).eq('id', videoId)
    .select(DEAL_VIDEO_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteDealVideo(db: Db, profile: Profile, videoId: string) {
  const { data: v } = await db.from('deal_videos').select('deal_id').eq('workspace_id', profile.workspace_id).eq('id', videoId).maybeSingle()
  if (!v) throw new Error('video not found')
  await assertDealAccess(db, profile, v.deal_id)
  const { error } = await db.from('deal_videos').delete().eq('workspace_id', profile.workspace_id).eq('id', videoId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ---- Campaigns (client/brand engagements grouping creators + deals) ---------

const CAMPAIGN_COLS = 'id, name, client, brief, status, start_date, end_date, created_by, created_at, updated_at'

// All workspace campaigns + per-campaign counts (pipeline creators, deals, signed).
export async function listCampaigns(db: Db, profile: Profile) {
  const [{ data: camps, error }, { data: pipes }, { data: deals }] = await Promise.all([
    db.from('campaigns').select(CAMPAIGN_COLS).eq('workspace_id', profile.workspace_id).order('created_at', { ascending: false }),
    db.from('pipeline').select('campaign_id').eq('workspace_id', profile.workspace_id),
    db.from('deals').select('campaign_id, signed_at').eq('workspace_id', profile.workspace_id),
  ])
  if (error) throw new Error(error.message)
  const pipeCount = new Map<string, number>()
  for (const p of pipes ?? []) if (p.campaign_id) pipeCount.set(p.campaign_id, (pipeCount.get(p.campaign_id) ?? 0) + 1)
  const dealCount = new Map<string, number>()
  const signedCount = new Map<string, number>()
  for (const d of deals ?? []) {
    if (!d.campaign_id) continue
    dealCount.set(d.campaign_id, (dealCount.get(d.campaign_id) ?? 0) + 1)
    if (d.signed_at) signedCount.set(d.campaign_id, (signedCount.get(d.campaign_id) ?? 0) + 1)
  }
  const campaigns = (camps ?? []).map(c => ({
    ...c,
    pipeline_count: pipeCount.get(c.id) ?? 0,
    deal_count: dealCount.get(c.id) ?? 0,
    signed_count: signedCount.get(c.id) ?? 0,
  }))
  return { campaigns }
}

// One campaign + the creators (pipeline rows) and deals tagged to it.
export async function getCampaign(db: Db, profile: Profile, id: string) {
  const { data: c } = await db.from('campaigns').select(CAMPAIGN_COLS).eq('workspace_id', profile.workspace_id).eq('id', id).maybeSingle()
  if (!c) throw new Error('campaign not found')
  // Members only see their own pipeline rows / deals within the campaign.
  let pq = db.from('pipeline').select('*').eq('workspace_id', profile.workspace_id).eq('campaign_id', id)
  let dq = db.from('deals').select(DEAL_COLS).eq('workspace_id', profile.workspace_id).eq('campaign_id', id)
  if (profile.role !== 'admin') { pq = pq.eq('assigned_to', profile.id); dq = dq.eq('owner_id', profile.id) }
  const [{ data: pipeline }, { data: deals }, { data: users }] = await Promise.all([
    pq, dq, db.from('users').select('id, name').eq('workspace_id', profile.workspace_id),
  ])
  const nameOf = new Map((users ?? []).map(u => [u.id, u.name]))
  return {
    ...c,
    pipeline_count: (pipeline ?? []).length,
    deal_count: (deals ?? []).length,
    signed_count: (deals ?? []).filter(d => d.signed_at).length,
    pipeline: pipeline ?? [],
    deals: (deals ?? []).map(d => ({
      ...d,
      owner_name: d.owner_id ? (nameOf.get(d.owner_id) ?? null) : null,
      created_by_name: d.created_by ? (nameOf.get(d.created_by) ?? null) : null,
      videos_posted: 0, total_views: 0,
    })),
  }
}

export async function createCampaign(db: Db, profile: Profile, input: { name?: string; client?: string; brief?: string; status?: string; start_date?: string; end_date?: string }) {
  if (profile.role !== 'admin') throw new Error('admin only')
  const name = input.name?.trim()
  if (!name) throw new Error('Campaign name required')
  const status = ['planning', 'active', 'completed', 'archived'].includes(input.status ?? '') ? input.status : 'planning'
  const { data, error } = await db.from('campaigns').insert({
    workspace_id: profile.workspace_id, name, client: input.client?.trim() || null,
    brief: input.brief?.trim() || null, status,
    start_date: input.start_date || null, end_date: input.end_date || null,
    created_by: profile.id,
  }).select(CAMPAIGN_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateCampaign(db: Db, profile: Profile, id: string, patch: Record<string, unknown>) {
  if (profile.role !== 'admin') throw new Error('admin only')
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof patch.name === 'string' && patch.name.trim()) set.name = patch.name.trim()
  if ('client' in patch) set.client = patch.client ? String(patch.client).trim() : null
  if ('brief' in patch) set.brief = patch.brief ? String(patch.brief) : null
  if (['planning', 'active', 'completed', 'archived'].includes(String(patch.status))) set.status = patch.status
  if ('start_date' in patch) set.start_date = patch.start_date ? String(patch.start_date) : null
  if ('end_date' in patch) set.end_date = patch.end_date ? String(patch.end_date) : null
  const { data, error } = await db.from('campaigns').update(set).eq('workspace_id', profile.workspace_id).eq('id', id).select(CAMPAIGN_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteCampaign(db: Db, profile: Profile, id: string) {
  if (profile.role !== 'admin') throw new Error('admin only')
  // FK on delete set null detaches pipeline rows + deals; they survive.
  const { error } = await db.from('campaigns').delete().eq('workspace_id', profile.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}
