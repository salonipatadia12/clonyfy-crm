import 'server-only'
import { cookies } from 'next/headers'
import type { Profile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scoreMatch, briefFromCampaign, type MatchReason } from '@/lib/match'
import { CC_STAGES, CLOSED_STAGES, ccStageLabel } from '@/lib/domain'
import { CREATOR_VIEWS, DEFAULT_CREATOR_VIEW, type CreatorViewKey } from '@/lib/crm-views'
import { queuesFor, OUTREACH_QUEUE_META } from '@/lib/outreach-queues'
import type {
  Client, Product, Campaign, CampaignRow, CampaignCreator, CampaignStats,
  CreatorRow, CreatorListResponse, CreatorDetailResponse,
  DeliverableRow, OfferRow, OutreachActivityRow, TodayResponse, TemplateRow,
  DashboardResponse,
  AnalyticsFilters, AnalyticsPayload, OutreachQueue, OutreachRow,
  CreatorReviewRow,
} from '@/types/campaign'

type Db = ReturnType<typeof createAdminClient>

const todayStr = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()

/** Strip PostgREST filter metacharacters so a term cannot break out of an .or(). */
const sanitize = (s: string) => s.replace(/[,()*:"\\%]/g, ' ').trim().slice(0, 120)

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null
const int = (v: unknown): number | null => {
  const n = num(v)
  return n == null ? null : Math.round(n)
}
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const arr = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null
  const out = v.map(x => String(x).trim()).filter(Boolean)
  return out.length ? out : null
}

function requireAdmin(profile: Profile, what: string) {
  if (profile.role !== 'admin') throw new Error(`Only an admin can ${what}.`)
}

// ===========================================================================
// Demo-data visibility
// ===========================================================================
/**
 * Whether simulated records are shown, read from a per-browser cookie set by
 * the toggle in the header.
 *
 * The filter is applied at four chokepoints — clients, products, campaigns and
 * campaign_creators — because every other operational list (outreach, offers,
 * deliverables, Today, analytics) is derived from those. Filtering here means a
 * new list cannot accidentally leak demo rows into a view that claims to be
 * hiding them.
 */
export const DEMO_COOKIE = 'clonify_demo'

async function demoVisible(): Promise<boolean> {
  try {
    const jar = await cookies()
    return jar.get(DEMO_COOKIE)?.value !== 'off'
  } catch {
    // Outside a request scope (scripts, tests): show everything.
    return true
  }
}

/** Adds "and this row is not part of a demo run" when demo data is hidden. */
function hideDemo<T>(q: T, show: boolean): T {
  return show ? q : ((q as { is: (c: string, v: null) => T }).is('demo_run_id', null))
}

// ===========================================================================
// Clients
// ===========================================================================

const CLIENT_COLS = 'id, name, website, primary_contact, contact_email, notes, status, created_at, demo_run_id'

export async function listClients(db: Db, p: Profile): Promise<Client[]> {
  const show = await demoVisible()
  const [{ data: clients, error }, { data: products }, { data: camps }] = await Promise.all([
    hideDemo(db.from('clients').select(CLIENT_COLS).eq('workspace_id', p.workspace_id), show).order('name'),
    hideDemo(db.from('products').select('client_id').eq('workspace_id', p.workspace_id), show),
    hideDemo(db.from('campaigns').select('client_id').eq('workspace_id', p.workspace_id), show),
  ])
  if (error) throw new Error(error.message)
  const pc = new Map<string, number>()
  for (const r of products ?? []) pc.set(r.client_id, (pc.get(r.client_id) ?? 0) + 1)
  const cc = new Map<string, number>()
  for (const r of camps ?? []) if (r.client_id) cc.set(r.client_id, (cc.get(r.client_id) ?? 0) + 1)
  return (clients ?? []).map(c => ({
    ...c, product_count: pc.get(c.id) ?? 0, campaign_count: cc.get(c.id) ?? 0,
  })) as Client[]
}

export async function createClient(db: Db, p: Profile, input: Record<string, unknown>) {
  requireAdmin(p, 'create clients')
  const name = str(input.name)
  if (!name) throw new Error('Client name is required.')
  const { data, error } = await db.from('clients').insert({
    workspace_id: p.workspace_id, name,
    website: str(input.website), primary_contact: str(input.primary_contact),
    contact_email: str(input.contact_email), notes: str(input.notes),
    status: ['active', 'paused', 'archived'].includes(String(input.status)) ? input.status : 'active',
    created_by: p.id,
  }).select(CLIENT_COLS).single()
  if (error) throw new Error(error.code === '23505' ? `A client named "${name}" already exists.` : error.message)
  return data
}

export async function updateClient(db: Db, p: Profile, id: string, patch: Record<string, unknown>) {
  requireAdmin(p, 'edit clients')
  const set: Record<string, unknown> = { updated_at: nowIso() }
  if ('name' in patch) { const n = str(patch.name); if (!n) throw new Error('Client name is required.'); set.name = n }
  for (const k of ['website', 'primary_contact', 'contact_email', 'notes'] as const) if (k in patch) set[k] = str(patch[k])
  if (['active', 'paused', 'archived'].includes(String(patch.status))) set.status = patch.status
  const { data, error } = await db.from('clients').update(set)
    .eq('workspace_id', p.workspace_id).eq('id', id).select(CLIENT_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteClient(db: Db, p: Profile, id: string) {
  requireAdmin(p, 'delete clients')
  const { count } = await db.from('campaigns').select('id', { count: 'exact', head: true })
    .eq('workspace_id', p.workspace_id).eq('client_id', id)
  if (count) throw new Error(`This client has ${count} campaign${count === 1 ? '' : 's'}. Archive it instead so the campaign history is kept.`)
  const { error } = await db.from('clients').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Products
// ===========================================================================

const PRODUCT_COLS = 'id, client_id, name, product_url, category, description, target_customer, selling_points, price_note, prohibited_claims, talking_points, asset_links, status, created_at, demo_run_id'

export async function listProducts(db: Db, p: Profile, clientId?: string): Promise<Product[]> {
  const show = await demoVisible()
  let q = hideDemo(db.from('products').select(PRODUCT_COLS).eq('workspace_id', p.workspace_id), show)
  if (clientId) q = q.eq('client_id', clientId)
  const [{ data, error }, { data: clients }, { data: camps }] = await Promise.all([
    q.order('name'),
    db.from('clients').select('id, name').eq('workspace_id', p.workspace_id),
    db.from('campaigns').select('product_id').eq('workspace_id', p.workspace_id),
  ])
  if (error) throw new Error(error.message)
  const clientName = new Map((clients ?? []).map(c => [c.id, c.name]))
  const campCount = new Map<string, number>()
  for (const c of camps ?? []) if (c.product_id) campCount.set(c.product_id, (campCount.get(c.product_id) ?? 0) + 1)
  return (data ?? []).map(r => ({
    ...r, client_name: clientName.get(r.client_id) ?? null, campaign_count: campCount.get(r.id) ?? 0,
  })) as Product[]
}

export async function createProduct(db: Db, p: Profile, input: Record<string, unknown>) {
  requireAdmin(p, 'create products')
  const name = str(input.name)
  const clientId = str(input.client_id)
  if (!name) throw new Error('Product name is required.')
  if (!clientId) throw new Error('Pick the client this product belongs to.')
  const { data: client } = await db.from('clients').select('id')
    .eq('workspace_id', p.workspace_id).eq('id', clientId).maybeSingle()
  if (!client) throw new Error('That client does not exist in this workspace.')
  const { data, error } = await db.from('products').insert({
    workspace_id: p.workspace_id, client_id: clientId, name,
    product_url: str(input.product_url), category: str(input.category),
    description: str(input.description), target_customer: str(input.target_customer),
    selling_points: arr(input.selling_points), price_note: str(input.price_note),
    prohibited_claims: str(input.prohibited_claims), talking_points: arr(input.talking_points),
    asset_links: arr(input.asset_links),
    status: ['active', 'paused', 'archived'].includes(String(input.status)) ? input.status : 'active',
    created_by: p.id,
  }).select(PRODUCT_COLS).single()
  if (error) throw new Error(error.code === '23505' ? `That client already has a product named "${name}".` : error.message)
  return data
}

export async function updateProduct(db: Db, p: Profile, id: string, patch: Record<string, unknown>) {
  requireAdmin(p, 'edit products')
  const set: Record<string, unknown> = { updated_at: nowIso() }
  if ('name' in patch) { const n = str(patch.name); if (!n) throw new Error('Product name is required.'); set.name = n }
  for (const k of ['product_url', 'category', 'description', 'target_customer', 'price_note', 'prohibited_claims'] as const)
    if (k in patch) set[k] = str(patch[k])
  for (const k of ['selling_points', 'talking_points', 'asset_links'] as const) if (k in patch) set[k] = arr(patch[k])
  if (['active', 'paused', 'archived'].includes(String(patch.status))) set.status = patch.status
  const { data, error } = await db.from('products').update(set)
    .eq('workspace_id', p.workspace_id).eq('id', id).select(PRODUCT_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteProduct(db: Db, p: Profile, id: string) {
  requireAdmin(p, 'delete products')
  const { count } = await db.from('campaigns').select('id', { count: 'exact', head: true })
    .eq('workspace_id', p.workspace_id).eq('product_id', id)
  if (count) throw new Error(`This product is used by ${count} campaign${count === 1 ? '' : 's'}. Archive it instead.`)
  const { error } = await db.from('products').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Campaigns
// ===========================================================================

const CAMPAIGN_COLS = 'id, name, client, client_id, product_id, owner_id, brief, status, start_date, end_date, objective, objective_note, brief_niches, brief_min_followers, brief_max_followers, brief_geo, brief_platforms, brief_entity_types, brief_contact_pref, brief_creator_target, brief_exclusions, brief_notes, offer_type, offer_flat_fee, offer_commission_pct, offer_gifted_product, offer_currency, budget_total, deliverable_plan, usage_rights, whitelisting, approval_required, talking_points, cta, discount_code, tracking_url, hashtags, disclosure_required, prohibited_language, created_at, updated_at, demo_run_id'

function shapeCampaign(
  row: Record<string, unknown>,
  clientName: Map<string, string>,
  productName: Map<string, string>,
  userName: Map<string, string>,
): CampaignRow {
  const cid = row.client_id as string | null
  const pid = row.product_id as string | null
  const oid = row.owner_id as string | null
  return {
    ...(row as unknown as CampaignRow),
    client_name: cid ? (clientName.get(cid) ?? null) : (row.client as string | null),
    product_name: pid ? (productName.get(pid) ?? null) : null,
    owner_name: oid ? (userName.get(oid) ?? null) : null,
    brief_min_followers: num(row.brief_min_followers),
    brief_max_followers: num(row.brief_max_followers),
    offer_flat_fee: num(row.offer_flat_fee),
    offer_commission_pct: num(row.offer_commission_pct),
    budget_total: num(row.budget_total),
    deliverable_plan: Array.isArray(row.deliverable_plan) ? row.deliverable_plan as CampaignRow['deliverable_plan'] : [],
  }
}

async function lookupMaps(db: Db, p: Profile) {
  const [{ data: clients }, { data: products }, { data: users }] = await Promise.all([
    db.from('clients').select('id, name').eq('workspace_id', p.workspace_id),
    db.from('products').select('id, name').eq('workspace_id', p.workspace_id),
    db.from('users').select('id, name').eq('workspace_id', p.workspace_id),
  ])
  return {
    clientName: new Map((clients ?? []).map(c => [c.id, c.name])),
    productName: new Map((products ?? []).map(c => [c.id, c.name])),
    userName: new Map((users ?? []).map(c => [c.id, c.name])),
  }
}

/** Aggregate the relationship rows + their children into per-campaign stats. */
function buildStats(
  ccRows: { id: string; campaign_id: string; stage: string; next_follow_up: string | null }[],
  deliverables: { campaign_creator_id: string; approval_state: string; due_date: string | null }[],
  offers: { campaign_creator_id: string; status: string; flat_fee: number | null; currency: string }[],
  ccToCampaign: Map<string, string>,
): Map<string, CampaignStats> {
  const t = todayStr()
  const out = new Map<string, CampaignStats>()
  const blank = (): CampaignStats => ({
    creators: 0, notContacted: 0, contacted: 0, replied: 0, interested: 0, declined: 0,
    byStage: {}, followUpsOverdue: 0,
    deliverablesTotal: 0, deliverablesPublished: 0, deliverablesOverdue: 0,
    awaitingApproval: 0, committedSpend: null, currency: 'USD',
  })
  const get = (id: string) => { let s = out.get(id); if (!s) { s = blank(); out.set(id, s) } return s }

  for (const r of ccRows) {
    const s = get(r.campaign_id)
    s.creators++
    s.byStage[r.stage] = (s.byStage[r.stage] ?? 0) + 1
    // One influencer sits in exactly one status, so these six numbers add up
    // to the total — no "at or past" arithmetic to explain.
    if (r.stage === 'not_contacted') s.notContacted++
    if (r.stage === 'contacted') s.contacted++
    if (r.stage === 'replied') s.replied++
    if (r.stage === 'interested') s.interested++
    if (r.stage === 'declined') s.declined++
    if (r.next_follow_up && r.next_follow_up < t && !CLOSED_STAGES.includes(r.stage as never)) s.followUpsOverdue++
  }
  for (const d of deliverables) {
    const cid = ccToCampaign.get(d.campaign_creator_id)
    if (!cid) continue
    const s = get(cid)
    s.deliverablesTotal++
    if (d.approval_state === 'published') s.deliverablesPublished++
    else if (d.due_date && d.due_date < t) s.deliverablesOverdue++
    if (d.approval_state === 'submitted') s.awaitingApproval++
  }
  for (const o of offers) {
    const cid = ccToCampaign.get(o.campaign_creator_id)
    if (!cid) continue
    const s = get(cid)
    if (o.status === 'accepted' && o.flat_fee != null) {
      s.committedSpend = (s.committedSpend ?? 0) + Number(o.flat_fee)
      s.currency = o.currency || s.currency
    }
  }
  return out
}

export async function listCampaignsV2(db: Db, p: Profile): Promise<Campaign[]> {
  const showDemo = await demoVisible()
  const [{ data: rows, error }, maps] = await Promise.all([
    hideDemo(db.from('campaigns').select(CAMPAIGN_COLS).eq('workspace_id', p.workspace_id), showDemo)
      .order('created_at', { ascending: false }),
    lookupMaps(db, p),
  ])
  if (error) throw new Error(error.message)

  const { data: ccs } = await db.from('campaign_creators')
    .select('id, campaign_id, stage, next_follow_up').eq('workspace_id', p.workspace_id)
  const ccToCampaign = new Map((ccs ?? []).map(c => [c.id, c.campaign_id]))
  const [{ data: dlv }, { data: offs }] = await Promise.all([
    db.from('deliverables').select('campaign_creator_id, approval_state, due_date').eq('workspace_id', p.workspace_id),
    db.from('offers').select('campaign_creator_id, status, flat_fee, currency').eq('workspace_id', p.workspace_id),
  ])
  const stats = buildStats(ccs ?? [], dlv ?? [], offs ?? [], ccToCampaign)
  const blank: CampaignStats = {
    creators: 0, notContacted: 0, contacted: 0, replied: 0, interested: 0, declined: 0,
    byStage: {}, followUpsOverdue: 0, deliverablesTotal: 0, deliverablesPublished: 0,
    deliverablesOverdue: 0, awaitingApproval: 0, committedSpend: null, currency: 'USD',
  }
  return (rows ?? []).map(r => ({
    ...shapeCampaign(r as Record<string, unknown>, maps.clientName, maps.productName, maps.userName),
    stats: stats.get(r.id as string) ?? { ...blank },
  }))
}

export async function getCampaignV2(db: Db, p: Profile, id: string): Promise<Campaign> {
  const [{ data: row }, maps] = await Promise.all([
    db.from('campaigns').select(CAMPAIGN_COLS).eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle(),
    lookupMaps(db, p),
  ])
  if (!row) throw new Error('Campaign not found.')
  const { data: ccs } = await db.from('campaign_creators')
    .select('id, campaign_id, stage, next_follow_up').eq('workspace_id', p.workspace_id).eq('campaign_id', id)
  const ccToCampaign = new Map((ccs ?? []).map(c => [c.id, c.campaign_id]))
  const ids = [...ccToCampaign.keys()]
  const [{ data: dlv }, { data: offs }] = ids.length ? await Promise.all([
    db.from('deliverables').select('campaign_creator_id, approval_state, due_date').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ids),
    db.from('offers').select('campaign_creator_id, status, flat_fee, currency').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ids),
  ]) : [{ data: [] }, { data: [] }]
  const stats = buildStats(ccs ?? [], dlv ?? [], offs ?? [], ccToCampaign)
  const blank: CampaignStats = {
    creators: 0, notContacted: 0, contacted: 0, replied: 0, interested: 0, declined: 0,
    byStage: {}, followUpsOverdue: 0, deliverablesTotal: 0, deliverablesPublished: 0,
    deliverablesOverdue: 0, awaitingApproval: 0, committedSpend: null, currency: 'USD',
  }
  return {
    ...shapeCampaign(row as Record<string, unknown>, maps.clientName, maps.productName, maps.userName),
    stats: stats.get(id) ?? blank,
  }
}

const OBJECTIVES = new Set(['awareness', 'traffic', 'leads', 'sales', 'ugc', 'product_launch', 'custom'])
const OFFER_TYPES = new Set(['gifted', 'flat_fee', 'commission', 'flat_plus_commission', 'custom'])
const GEOS = new Set(['us_only', 'us_preferred', 'any'])
const CONTACT_PREFS = new Set(['any', 'email', 'instagram', 'phone'])

/** Shared field mapping for campaign create + update. */
function campaignFields(input: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const set: Record<string, unknown> = {}
  const has = (k: string) => !partial || k in input

  if (has('name')) { const n = str(input.name); if (!partial || 'name' in input) { if (!n) throw new Error('Campaign name is required.'); set.name = n } }
  if (has('client_id')) set.client_id = str(input.client_id)
  if (has('product_id')) set.product_id = str(input.product_id)
  if (has('owner_id')) set.owner_id = str(input.owner_id)
  if (has('brief')) set.brief = str(input.brief)
  if (has('status') && ['planning', 'active', 'completed', 'archived'].includes(String(input.status))) set.status = input.status
  if (has('start_date')) set.start_date = str(input.start_date)
  if (has('end_date')) set.end_date = str(input.end_date)

  if (has('objective')) set.objective = OBJECTIVES.has(String(input.objective)) ? input.objective : null
  if (has('objective_note')) set.objective_note = str(input.objective_note)

  if (has('brief_niches')) set.brief_niches = arr(input.brief_niches)
  if (has('brief_min_followers')) set.brief_min_followers = int(input.brief_min_followers)
  if (has('brief_max_followers')) set.brief_max_followers = int(input.brief_max_followers)
  if (has('brief_geo')) set.brief_geo = GEOS.has(String(input.brief_geo)) ? input.brief_geo : null
  if (has('brief_platforms')) set.brief_platforms = arr(input.brief_platforms)
  if (has('brief_entity_types')) set.brief_entity_types = arr(input.brief_entity_types)
  if (has('brief_contact_pref')) set.brief_contact_pref = CONTACT_PREFS.has(String(input.brief_contact_pref)) ? input.brief_contact_pref : null
  if (has('brief_creator_target')) set.brief_creator_target = int(input.brief_creator_target)
  if (has('brief_exclusions')) set.brief_exclusions = str(input.brief_exclusions)
  if (has('brief_notes')) set.brief_notes = str(input.brief_notes)

  if (has('offer_type')) set.offer_type = OFFER_TYPES.has(String(input.offer_type)) ? input.offer_type : null
  if (has('offer_flat_fee')) set.offer_flat_fee = num(input.offer_flat_fee)
  if (has('offer_commission_pct')) set.offer_commission_pct = num(input.offer_commission_pct)
  if (has('offer_gifted_product')) set.offer_gifted_product = str(input.offer_gifted_product)
  if (has('offer_currency')) set.offer_currency = str(input.offer_currency) ?? 'USD'
  if (has('budget_total')) set.budget_total = num(input.budget_total)

  if (has('deliverable_plan')) set.deliverable_plan = Array.isArray(input.deliverable_plan) ? input.deliverable_plan : []
  if (has('usage_rights')) set.usage_rights = str(input.usage_rights)
  if (has('whitelisting')) set.whitelisting = !!input.whitelisting
  if (has('approval_required')) set.approval_required = input.approval_required !== false

  if (has('talking_points')) set.talking_points = arr(input.talking_points)
  if (has('cta')) set.cta = str(input.cta)
  if (has('discount_code')) set.discount_code = str(input.discount_code)
  if (has('tracking_url')) set.tracking_url = str(input.tracking_url)
  if (has('hashtags')) set.hashtags = arr(input.hashtags)
  if (has('disclosure_required')) set.disclosure_required = str(input.disclosure_required)
  if (has('prohibited_language')) set.prohibited_language = str(input.prohibited_language)
  return set
}

export async function createCampaignV2(db: Db, p: Profile, input: Record<string, unknown>) {
  requireAdmin(p, 'create campaigns')
  const set = campaignFields(input, false)
  if (!set.name) throw new Error('Campaign name is required.')
  if (!set.product_id) throw new Error('Pick the product this campaign promotes.')
  const { data: prod } = await db.from('products').select('id, client_id')
    .eq('workspace_id', p.workspace_id).eq('id', String(set.product_id)).maybeSingle()
  if (!prod) throw new Error('That product does not exist in this workspace.')
  // The client always follows the product, so the two can never disagree.
  set.client_id = prod.client_id
  const { data, error } = await db.from('campaigns').insert({
    workspace_id: p.workspace_id, created_by: p.id, owner_id: set.owner_id ?? p.id, ...set,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return getCampaignV2(db, p, data.id)
}

export async function updateCampaignV2(db: Db, p: Profile, id: string, patch: Record<string, unknown>) {
  requireAdmin(p, 'edit campaigns')
  const set = campaignFields(patch, true)
  if (set.product_id) {
    const { data: prod } = await db.from('products').select('id, client_id')
      .eq('workspace_id', p.workspace_id).eq('id', String(set.product_id)).maybeSingle()
    if (!prod) throw new Error('That product does not exist in this workspace.')
    set.client_id = prod.client_id
  }
  set.updated_at = nowIso()
  const { error } = await db.from('campaigns').update(set).eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return getCampaignV2(db, p, id)
}

export async function deleteCampaignV2(db: Db, p: Profile, id: string) {
  requireAdmin(p, 'delete campaigns')
  const { error } = await db.from('campaigns').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Campaign creators — the relationship
// ===========================================================================

const CC_COLS = 'id, campaign_id, influencer_id, handle, stage, owner_id, match_score, match_reasons, next_follow_up, last_touch, notes, source, added_at, demo_run_id, outreach_channel, last_contacted_on'
const CREATOR_JOIN_COLS = 'id, handle, full_name, follower_count, niche, platform, profile_url, email, phone, geo_status, contact_status, entity_type, qualification_status, verification_status'

/**
 * Hydrate relationship rows with their creator facts and their child
 * aggregates. One query per table rather than N+1 per row.
 */
async function hydrateCampaignCreators(
  db: Db, p: Profile, rows: Record<string, unknown>[],
): Promise<CampaignCreator[]> {
  if (!rows.length) return []
  const ccIds = rows.map(r => r.id as string)
  const infIds = [...new Set(rows.map(r => r.influencer_id as string))]
  const campIds = [...new Set(rows.map(r => r.campaign_id as string))]

  const [{ data: creators }, { data: offers }, { data: dlv }, { data: outreach }, { data: users }, { data: camps }] =
    await Promise.all([
      db.from('influencers').select(CREATOR_JOIN_COLS).eq('workspace_id', p.workspace_id).in('id', infIds),
      db.from('offers').select('*').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds),
      db.from('deliverables').select('campaign_creator_id, approval_state, due_date').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds),
      db.from('outreach_activities').select('campaign_creator_id, occurred_at, reply_status')
        .eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds).order('occurred_at', { ascending: false }),
      db.from('users').select('id, name').eq('workspace_id', p.workspace_id),
      db.from('campaigns').select('id, name, client_id, product_id').eq('workspace_id', p.workspace_id).in('id', campIds),
    ])

  const maps = await lookupMaps(db, p)
  const creatorById = new Map((creators ?? []).map(c => [c.id, c]))
  const offerByCc = new Map((offers ?? []).map(o => [o.campaign_creator_id, o as unknown as OfferRow]))
  const userName = new Map((users ?? []).map(u => [u.id, u.name]))
  const campById = new Map((camps ?? []).map(c => [c.id, c]))

  const t = todayStr()
  const dlvAgg = new Map<string, { total: number; published: number; overdue: number }>()
  for (const d of dlv ?? []) {
    const a = dlvAgg.get(d.campaign_creator_id) ?? { total: 0, published: 0, overdue: 0 }
    a.total++
    if (d.approval_state === 'published') a.published++
    else if (d.due_date && d.due_date < t) a.overdue++
    dlvAgg.set(d.campaign_creator_id, a)
  }
  const outAgg = new Map<string, { count: number; last: string | null; reply: string | null }>()
  for (const o of outreach ?? []) {
    const a = outAgg.get(o.campaign_creator_id) ?? { count: 0, last: null, reply: null }
    a.count++
    // Rows arrive newest-first, so the first one seen is the most recent.
    if (!a.last) { a.last = o.occurred_at; a.reply = o.reply_status }
    outAgg.set(o.campaign_creator_id, a)
  }

  return rows.map(r => {
    const c = creatorById.get(r.influencer_id as string)
    const camp = campById.get(r.campaign_id as string)
    const d = dlvAgg.get(r.id as string)
    const o = outAgg.get(r.id as string)
    return {
      id: r.id as string,
      campaign_id: r.campaign_id as string,
      campaign_name: camp?.name ?? null,
      client_name: camp?.client_id ? (maps.clientName.get(camp.client_id) ?? null) : null,
      product_name: camp?.product_id ? (maps.productName.get(camp.product_id) ?? null) : null,
      influencer_id: r.influencer_id as string,
      handle: r.handle as string,
      stage: r.stage as string,
      owner_id: (r.owner_id as string) ?? null,
      owner_name: r.owner_id ? (userName.get(r.owner_id as string) ?? null) : null,
      match_score: r.match_score == null ? null : Number(r.match_score),
      match_reasons: Array.isArray(r.match_reasons) ? (r.match_reasons as MatchReason[]) : [],
      next_follow_up: (r.next_follow_up as string) ?? null,
      last_touch: (r.last_touch as string) ?? null,
      outreach_channel: (r.outreach_channel as string) ?? null,
      last_contacted_on: (r.last_contacted_on as string) ?? null,
      notes: (r.notes as string) ?? null,
      source: (r.source as string) ?? null,
      added_at: r.added_at as string,
      full_name: c?.full_name ?? null,
      follower_count: c?.follower_count ?? null,
      niche: c?.niche ?? null,
      platform: c?.platform ?? null,
      profile_url: c?.profile_url ?? null,
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      geo_status: c?.geo_status ?? null,
      contact_status: c?.contact_status ?? null,
      entity_type: c?.entity_type ?? null,
      qualification_status: c?.qualification_status ?? null,
      verification_status: c?.verification_status ?? null,
      offer: offerByCc.get(r.id as string) ?? null,
      deliverables_total: d?.total ?? 0,
      deliverables_published: d?.published ?? 0,
      deliverables_overdue: d?.overdue ?? 0,
      last_outreach_at: o?.last ?? null,
      last_reply_status: o?.reply ?? null,
      outreach_count: o?.count ?? 0,
    }
  })
}

/** Members see the relationships they own plus unowned ones; admins see all. */
function scopeCc<T extends { eq: (a: string, b: unknown) => T; or: (s: string) => T }>(q: T, p: Profile): T {
  if (p.role === 'admin') return q
  return q.or(`owner_id.eq.${p.id},owner_id.is.null`)
}

export async function listCampaignCreators(
  db: Db, p: Profile, opts: { campaignId?: string; influencerId?: string; stage?: string; ownerId?: string } = {},
): Promise<CampaignCreator[]> {
  let q = hideDemo(
    db.from('campaign_creators').select(CC_COLS).eq('workspace_id', p.workspace_id),
    await demoVisible())
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId)
  if (opts.influencerId) q = q.eq('influencer_id', opts.influencerId)
  if (opts.stage) q = q.eq('stage', opts.stage)
  if (opts.ownerId) q = q.eq('owner_id', opts.ownerId)
  q = scopeCc(q, p)
  const { data, error } = await q.order('added_at', { ascending: false })
  if (error) throw new Error(error.message)
  return hydrateCampaignCreators(db, p, (data ?? []) as Record<string, unknown>[])
}

/**
 * Add creators to a campaign.
 *
 * This is the operation the old `pipeline` table could not express: the same
 * creator can be added to any number of campaigns, and each membership gets its
 * own stage, owner and score. `on conflict do nothing` on (campaign_id,
 * influencer_id) makes a repeat add idempotent within one campaign while
 * leaving every other campaign untouched.
 */
export async function addCreatorsToCampaign(
  db: Db, p: Profile,
  input: { campaignId: string; influencerIds: string[]; stage?: string; ownerId?: string | null; source?: string },
): Promise<{ added: number; alreadyPresent: number; skipped: string[] }> {
  const campaign = await getCampaignV2(db, p, input.campaignId)
  const ids = [...new Set(input.influencerIds.filter(Boolean))].slice(0, 500)
  if (!ids.length) return { added: 0, alreadyPresent: 0, skipped: [] }

  const stage = CC_STAGES.includes(input.stage as never) ? input.stage! : 'not_contacted'
  const { data: creators } = await db.from('influencers')
    .select(`${CREATOR_JOIN_COLS}, is_verified`).eq('workspace_id', p.workspace_id).in('id', ids)
  const found = new Map((creators ?? []).map(c => [c.id, c]))
  const skipped = ids.filter(id => !found.has(id))

  const { data: existing } = await db.from('campaign_creators')
    .select('influencer_id').eq('workspace_id', p.workspace_id).eq('campaign_id', input.campaignId).in('influencer_id', ids)
  const have = new Set((existing ?? []).map(r => r.influencer_id))

  const brief = briefFromCampaign(campaign)
  const rows = ids.filter(id => found.has(id) && !have.has(id)).map(id => {
    const c = found.get(id)!
    const m = scoreMatch({
      niche: c.niche, follower_count: c.follower_count, geo_status: c.geo_status,
      platform: c.platform, contact_status: c.contact_status, email: c.email, phone: c.phone,
      profile_url: c.profile_url, entity_type: c.entity_type,
      qualification_status: c.qualification_status, verification_status: c.verification_status,
    }, brief)
    return {
      workspace_id: p.workspace_id,
      campaign_id: input.campaignId,
      influencer_id: id,
      handle: c.handle,
      stage,
      owner_id: input.ownerId === null ? null : (input.ownerId ?? p.id),
      match_score: m.score,
      match_reasons: [...m.blockers, ...m.reasons],
      source: input.source ?? 'search',
      added_by: p.id,
    }
  })

  if (!rows.length) return { added: 0, alreadyPresent: have.size, skipped }
  const { data: inserted, error } = await db.from('campaign_creators').insert(rows).select('id, handle')
  if (error) throw new Error(error.message)

  for (const r of inserted ?? []) {
    await logCrmActivity(db, p, 'added_to_pipeline', r.handle, { campaign: campaign.name, campaign_id: campaign.id })
  }
  return { added: inserted?.length ?? 0, alreadyPresent: have.size, skipped }
}

export async function updateCampaignCreator(
  db: Db, p: Profile, id: string, patch: Record<string, unknown>,
): Promise<CampaignCreator> {
  const { data: cur } = await db.from('campaign_creators').select('*')
    .eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('That campaign creator was not found.')
  if (p.role !== 'admin' && cur.owner_id && cur.owner_id !== p.id) {
    throw new Error('This creator is owned by another team member.')
  }

  const set: Record<string, unknown> = { updated_at: nowIso() }
  let stageChange: { from: string; to: string } | null = null
  if ('stage' in patch) {
    const s = String(patch.stage)
    if (!CC_STAGES.includes(s as never)) throw new Error(`"${s}" is not a valid stage.`)
    if (s !== cur.stage) { set.stage = s; stageChange = { from: cur.stage, to: s } }
  }
  if ('owner_id' in patch) set.owner_id = str(patch.owner_id)
  if ('next_follow_up' in patch) set.next_follow_up = str(patch.next_follow_up)
  if ('notes' in patch) set.notes = str(patch.notes)
  if ('match_score' in patch) set.match_score = int(patch.match_score)
  // The five fields the simplified campaign row stores.
  if ('outreach_channel' in patch) {
    const ch = str(patch.outreach_channel)
    if (ch && !['instagram_dm', 'email', 'phone'].includes(ch)) {
      throw new Error(`"${ch}" is not a channel we track.`)
    }
    set.outreach_channel = ch
  }
  if ('last_contacted_on' in patch) set.last_contacted_on = str(patch.last_contacted_on)

  if (Object.keys(set).length > 1) set.last_touch = nowIso()
  const { error } = await db.from('campaign_creators').update(set).eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)

  if (stageChange) {
    const { data: camp } = await db.from('campaigns').select('name').eq('id', cur.campaign_id).maybeSingle()
    await logCrmActivity(db, p, 'stage_changed', cur.handle, {
      from: stageChange.from, to: stageChange.to, campaign: camp?.name ?? null, campaign_id: cur.campaign_id,
    })
  }
  const rows = await hydrateCampaignCreators(db, p, [{ ...cur, ...set, id }])
  return rows[0]
}

export async function bulkUpdateCampaignCreators(
  db: Db, p: Profile, ids: string[], patch: { stage?: string; owner_id?: string | null; next_follow_up?: string | null },
): Promise<{ updated: number }> {
  const clean = [...new Set(ids.filter(Boolean))].slice(0, 500)
  if (!clean.length) return { updated: 0 }
  let updated = 0
  for (const id of clean) {
    try { await updateCampaignCreator(db, p, id, patch as Record<string, unknown>); updated++ }
    catch { /* a row the member does not own is skipped, not fatal for the batch */ }
  }
  return { updated }
}

export async function removeCampaignCreator(db: Db, p: Profile, id: string) {
  const { data: cur } = await db.from('campaign_creators').select('handle, owner_id, campaign_id')
    .eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('That campaign creator was not found.')
  if (p.role !== 'admin' && cur.owner_id !== p.id) throw new Error('This creator is owned by another team member.')
  const { error } = await db.from('campaign_creators').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  await logCrmActivity(db, p, 'removed_from_pipeline', cur.handle, { campaign_id: cur.campaign_id })
  return { ok: true }
}

/** Recompute every membership's score for a campaign, e.g. after the brief changes. */
export async function rescoreCampaign(db: Db, p: Profile, campaignId: string): Promise<{ rescored: number }> {
  const campaign = await getCampaignV2(db, p, campaignId)
  const brief = briefFromCampaign(campaign)
  const { data: ccs } = await db.from('campaign_creators')
    .select('id, influencer_id').eq('workspace_id', p.workspace_id).eq('campaign_id', campaignId)
  if (!ccs?.length) return { rescored: 0 }
  const { data: creators } = await db.from('influencers').select(CREATOR_JOIN_COLS)
    .eq('workspace_id', p.workspace_id).in('id', ccs.map(c => c.influencer_id))
  const byId = new Map((creators ?? []).map(c => [c.id, c]))
  let n = 0
  for (const cc of ccs) {
    const c = byId.get(cc.influencer_id)
    if (!c) continue
    const m = scoreMatch({
      niche: c.niche, follower_count: c.follower_count, geo_status: c.geo_status, platform: c.platform,
      contact_status: c.contact_status, email: c.email, phone: c.phone, profile_url: c.profile_url,
      entity_type: c.entity_type, qualification_status: c.qualification_status,
      verification_status: c.verification_status,
    }, brief)
    await db.from('campaign_creators')
      .update({ match_score: m.score, match_reasons: [...m.blockers, ...m.reasons] })
      .eq('workspace_id', p.workspace_id).eq('id', cc.id)
    n++
  }
  return { rescored: n }
}

// ===========================================================================
// Activity (reuses the existing activity_log table)
// ===========================================================================

async function logCrmActivity(
  db: Db, p: Profile, action: string, handle: string | null, metadata: Record<string, unknown>,
) {
  await db.from('activity_log').insert({
    workspace_id: p.workspace_id, user_id: p.id, user_name: p.name,
    profile_handle: handle, action, metadata,
  })
}

// ===========================================================================
// Creator catalog
// ===========================================================================

/**
 * The catalog's browsable predicate, defined ONCE.
 *
 * The old code applied `follower_count <= CEILING OR IS NULL` when listing but
 * `.lte(follower_count, CEILING)` when counting the total — and Postgres `lte`
 * drops NULLs, so the list could report more rows than the "grand total". Every
 * count and every page now goes through this function, which makes that class
 * of bug impossible.
 */
export const CATALOG_FOLLOWER_CEILING = 500_000

type PgQuery = {
  eq: (c: string, v: unknown) => PgQuery
  or: (s: string) => PgQuery
  in: (c: string, v: unknown[]) => PgQuery
  not: (c: string, op: string, v: unknown) => PgQuery
  gte: (c: string, v: unknown) => PgQuery
  lte: (c: string, v: unknown) => PgQuery
  lt: (c: string, v: unknown) => PgQuery
  ilike: (c: string, v: string) => PgQuery
  order: (c: string, o: Record<string, unknown>) => PgQuery
  range: (a: number, b: number) => PgQuery
}

function applyCatalogScope<T extends PgQuery>(q: T, workspaceId: string): T {
  return q
    .eq('workspace_id', workspaceId)
    .eq('hidden', false)
    // Unscraped contact-first candidates have a NULL follower_count and must
    // stay visible, so the ceiling is expressed as "at or below, or unknown".
    .or(`follower_count.lte.${CATALOG_FOLLOWER_CEILING},follower_count.is.null`) as T
}

export type CreatorView = CreatorViewKey

export interface CreatorListParams {
  view?: CreatorView
  search?: string
  niche?: string
  minFollowers?: number
  maxFollowers?: number
  geoStatus?: string
  platform?: string
  contact?: string          // 'email' | 'phone' | 'either' | 'none' | 'instagram'
  verification?: string
  entityType?: string
  qualification?: string
  campaignId?: string       // members of this campaign
  ccStage?: string          // members sitting at this campaign status
  notInCampaignId?: string  // exclude members of this campaign
  notForClientId?: string   // exclude creators previously used for this client
  ownerId?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const CREATOR_SORTABLE = new Set(['follower_count', 'handle', 'full_name', 'profile_completeness', 'last_verified_at'])
const CREATOR_COLS = 'id, handle, full_name, follower_count, niche, biography, bio_link, profile_url, is_verified, platform, source, location, country, language_code, geo_status, geo_evidence, email, email_type, phone, phone_type, contact_status, verification_status, entity_type, entity_source, entity_evidence, review_state, qualification_status, profile_completeness, last_verified_at, scraped_at'

/** Applies a saved view's predicate. Kept separate so counts and pages agree. */
function applyView<T extends PgQuery>(q: T, view: CreatorView): T {
  switch (view) {
    case 'qualified':     return q.eq('qualification_status', 'qualified') as T
    case 'candidate':     return q.eq('qualification_status', 'candidate') as T
    case 'us':            return q.in('geo_status', ['confirmed_us', 'likely_us']) as T
    case 'email':         return q.not('email', 'is', null) as T
    case 'phone':         return q.not('phone', 'is', null) as T
    case 'needs_contact': return q.eq('contact_status', 'none') as T
    case 'awaiting':      return q.eq('verification_status', 'pending_instagram_verification') as T
    // "Needs review" is the derived status, not a hand-listed set of entity
    // types — otherwise the view and the badge can disagree.
    case 'needs_class':   return q.eq('qualification_status', 'needs_review') as T
    default:              return q
  }
}

function applyCreatorFilters<T extends PgQuery>(q: T, p: CreatorListParams): T {
  let out = q
  if (p.search) {
    const s = `%${sanitize(p.search)}%`
    out = out.or(`handle.ilike.${s},full_name.ilike.${s},biography.ilike.${s}`) as T
  }
  if (p.niche) {
    // Comma-separated so a multi-niche campaign brief maps to one filter.
    const niches = p.niche.split(',').map(n => n.trim()).filter(Boolean)
    out = (niches.length > 1 ? out.in('niche', niches) : out.eq('niche', niches[0])) as T
  }
  if (p.geoStatus) out = out.eq('geo_status', p.geoStatus) as T
  if (p.platform) out = out.eq('platform', p.platform) as T
  if (p.verification) out = out.eq('verification_status', p.verification) as T
  if (p.entityType) out = out.eq('entity_type', p.entityType) as T
  if (p.qualification) out = out.eq('qualification_status', p.qualification) as T
  if (typeof p.minFollowers === 'number') out = out.gte('follower_count', p.minFollowers) as T
  if (typeof p.maxFollowers === 'number') out = out.lt('follower_count', p.maxFollowers) as T

  // Contact availability is per channel. "Instagram DM ready" is NOT
  // "has email and phone" — phone is never a gate on its own.
  switch (p.contact) {
    case 'email':     out = out.not('email', 'is', null) as T; break
    case 'phone':     out = out.not('phone', 'is', null) as T; break
    case 'either':    out = out.not('contact_status', 'eq', 'none') as T; break
    case 'none':      out = out.eq('contact_status', 'none') as T; break
    case 'instagram': out = out.eq('platform', 'instagram').eq('verification_status', 'instagram_verified') as T; break
  }
  return out
}

export async function listCreators(db: Db, p: Profile, params: CreatorListParams): Promise<CreatorListResponse> {
  const view = (CREATOR_VIEWS.some(v => v.key === params.view) ? params.view : DEFAULT_CREATOR_VIEW) as CreatorView
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200)
  const page = Math.max(params.page ?? 1, 1)
  const sort = params.sort && CREATOR_SORTABLE.has(params.sort) ? params.sort : 'follower_count'
  const ascending = params.order === 'asc'

  // Campaign-membership constraints resolve to an id set first, because they
  // cross tables.
  let restrictTo: string[] | null = null
  let exclude: Set<string> | null = null

  if (params.campaignId || params.ccStage || view === 'in_campaigns') {
    let mq = db.from('campaign_creators').select('influencer_id').eq('workspace_id', p.workspace_id)
    if (params.campaignId) mq = mq.eq('campaign_id', params.campaignId)
    // Resolved server-side, so "Contacted" means every contacted influencer in
    // the workspace — not just the ones on the page you happen to be looking at.
    if (params.ccStage) mq = mq.eq('stage', params.ccStage)
    const { data } = await mq
    restrictTo = [...new Set((data ?? []).map(r => r.influencer_id))]
    if (!restrictTo.length) {
      const catalogTotal = await countCatalog(db, p)
      return { rows: [], total: 0, viewTotal: 0, catalogTotal, page, pageSize }
    }
  }
  if (params.notInCampaignId) {
    const { data } = await db.from('campaign_creators').select('influencer_id')
      .eq('workspace_id', p.workspace_id).eq('campaign_id', params.notInCampaignId)
    exclude = new Set((data ?? []).map(r => r.influencer_id))
  }
  if (params.notForClientId) {
    const { data: camps } = await db.from('campaigns').select('id')
      .eq('workspace_id', p.workspace_id).eq('client_id', params.notForClientId)
    const campIds = (camps ?? []).map(c => c.id)
    if (campIds.length) {
      const { data } = await db.from('campaign_creators').select('influencer_id')
        .eq('workspace_id', p.workspace_id).in('campaign_id', campIds)
      exclude = exclude ?? new Set()
      for (const r of data ?? []) exclude.add(r.influencer_id)
    }
  }

  const build = (select: string, head: boolean) => {
    let q = db.from('influencers').select(select, head ? { count: 'exact', head: true } : { count: 'exact' }) as unknown as PgQuery
    q = applyCatalogScope(q, p.workspace_id)
    q = applyView(q, view)
    if (restrictTo) q = q.in('id', restrictTo)
    // PostgREST caps URL length; excluding a very large set client-side is safer.
    if (exclude && exclude.size && exclude.size <= 300) q = q.not('id', 'in', `(${[...exclude].join(',')})`)
    return q
  }

  // viewTotal is the same view with no field filters — the honest denominator
  // for "X of Y". It can never be smaller than `total`.
  const viewCountQ = build('id', true)
  const filteredQ = applyCreatorFilters(build(CREATOR_COLS, false), params)
    .order(sort, { ascending, nullsFirst: false })
    .order('handle', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  const [{ count: viewTotal }, listRes, catalogTotal] = await Promise.all([
    viewCountQ as unknown as Promise<{ count: number | null }>,
    filteredQ as unknown as Promise<{ data: Record<string, unknown>[] | null; count: number | null; error: { message: string } | null }>,
    countCatalog(db, p),
  ])
  if (listRes.error) throw new Error(listRes.error.message)

  let rows = (listRes.data ?? []) as unknown as CreatorRow[]
  // Large exclusion sets are applied here rather than in the URL.
  if (exclude && exclude.size > 300) rows = rows.filter(r => !exclude!.has(r.id))

  const withCampaigns = await attachMemberships(db, p, rows)
  return {
    rows: withCampaigns,
    total: listRes.count ?? withCampaigns.length,
    viewTotal: viewTotal ?? 0,
    catalogTotal,
    page,
    pageSize,
  }
}

async function countCatalog(db: Db, p: Profile): Promise<number> {
  const q = applyCatalogScope(
    db.from('influencers').select('id', { count: 'exact', head: true }) as unknown as PgQuery,
    p.workspace_id,
  ) as unknown as Promise<{ count: number | null }>
  const { count } = await q
  return count ?? 0
}

/** Attach every campaign each creator belongs to — a creator can be in many. */
async function attachMemberships(db: Db, p: Profile, rows: CreatorRow[]): Promise<CreatorRow[]> {
  if (!rows.length) return rows
  const { data: ccs } = await db.from('campaign_creators')
    .select('id, influencer_id, campaign_id, stage')
    .eq('workspace_id', p.workspace_id).in('influencer_id', rows.map(r => r.id))
  if (!ccs?.length) return rows.map(r => ({ ...r, campaigns: [] }))
  const { data: camps } = await db.from('campaigns').select('id, name, client_id')
    .eq('workspace_id', p.workspace_id).in('id', [...new Set(ccs.map(c => c.campaign_id))])
  const maps = await lookupMaps(db, p)
  const campById = new Map((camps ?? []).map(c => [c.id, c]))
  const byCreator = new Map<string, CreatorRow['campaigns']>()
  for (const cc of ccs) {
    const camp = campById.get(cc.campaign_id)
    if (!camp) continue
    const list = byCreator.get(cc.influencer_id) ?? []
    list.push({
      membership_id: cc.id,
      campaign_id: cc.campaign_id,
      campaign_name: camp.name,
      stage: cc.stage,
      client_name: camp.client_id ? (maps.clientName.get(camp.client_id) ?? null) : null,
    })
    byCreator.set(cc.influencer_id, list)
  }
  return rows.map(r => ({ ...r, campaigns: byCreator.get(r.id) ?? [] }))
}

export async function getCreator(db: Db, p: Profile, id: string): Promise<CreatorDetailResponse> {
  const { data: creator } = await db.from('influencers').select(CREATOR_COLS)
    .eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle()
  if (!creator) throw new Error('Creator not found.')

  const memberships = await listCampaignCreators(db, p, { influencerId: id })
  const ccIds = memberships.map(m => m.id)

  const [{ data: outreach }, { data: comments }, { data: activity }, { data: users }] = await Promise.all([
    ccIds.length
      ? db.from('outreach_activities').select('*').eq('workspace_id', p.workspace_id)
          .in('campaign_creator_id', ccIds).order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from('comments').select('id, author_name, body, created_at')
      .eq('workspace_id', p.workspace_id).eq('influencer_handle', creator.handle).order('created_at'),
    db.from('activity_log').select('id, user_name, action, created_at, metadata')
      .eq('workspace_id', p.workspace_id).eq('profile_handle', creator.handle)
      .order('created_at', { ascending: false }).limit(50),
    db.from('users').select('id, name').eq('workspace_id', p.workspace_id),
  ])
  const userName = new Map((users ?? []).map(u => [u.id, u.name]))
  const campaignByCc = new Map(memberships.map(m => [m.id, m.campaign_name ?? null]))

  const [withCampaigns] = await attachMemberships(db, p, [creator as unknown as CreatorRow])
  const reviews = await listCreatorReviews(db, p, id)
  return {
    creator: withCampaigns,
    memberships,
    reviews,
    outreach: ((outreach ?? []) as unknown as OutreachActivityRow[]).map(o => ({
      ...o,
      logged_by_name: o.logged_by ? (userName.get(o.logged_by) ?? null) : null,
      campaign_name: campaignByCc.get(o.campaign_creator_id) ?? null,
    })),
    comments: (comments ?? []) as CreatorDetailResponse['comments'],
    activity: (activity ?? []) as CreatorDetailResponse['activity'],
  }
}

export const REVIEWABLE_ENTITY_TYPES = [
  'individual_creator', 'likely_organization', 'brand', 'business',
  'institution', 'government', 'publisher', 'aggregator', 'unclassified',
] as const

/**
 * Record a human classification decision, with an audit trail.
 *
 * Admin only — it changes what the whole team sees. Every decision writes a
 * `creator_reviews` row carrying the actor, the timestamp, both previous states
 * and both new states, so a later reader can see who asserted what and when.
 * `entity_source` flips to 'human', which permanently protects the record from
 * any future heuristic backfill.
 */
export async function reviewCreator(
  db: Db, p: Profile, id: string,
  patch: { entity_type?: string; review_state?: string; reason?: string },
) {
  requireAdmin(p, 'change a creator’s classification')

  const { data: before } = await db.from('influencers')
    .select('id, entity_type, review_state')
    .eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle()
  if (!before) throw new Error('Creator not found.')

  const set: Record<string, unknown> = {}
  if (patch.entity_type && (REVIEWABLE_ENTITY_TYPES as readonly string[]).includes(patch.entity_type)) {
    set.entity_type = patch.entity_type
    set.entity_source = 'human'
    set.entity_evidence = patch.reason?.trim()
      ? `Set by ${p.name}: ${patch.reason.trim()}`
      : `Set by ${p.name} on ${new Date().toISOString().slice(0, 10)}.`
  }
  if (patch.review_state && ['unreviewed', 'approved', 'rejected'].includes(patch.review_state)) {
    set.review_state = patch.review_state
  }
  if (!Object.keys(set).length) throw new Error('Nothing to update.')
  set.last_verified_at = nowIso()

  const { data, error } = await db.from('influencers').update(set)
    .eq('workspace_id', p.workspace_id).eq('id', id).select(CREATOR_COLS).single()
  if (error) throw new Error(error.message)

  // The audit row is written after the update so it can never claim a change
  // that did not happen.
  await db.from('creator_reviews').insert({
    workspace_id: p.workspace_id,
    influencer_id: id,
    actor_id: p.id,
    actor_name: p.name,
    prev_entity_type: before.entity_type,
    new_entity_type: (set.entity_type as string | undefined) ?? before.entity_type,
    prev_review_state: before.review_state,
    new_review_state: (set.review_state as string | undefined) ?? before.review_state,
    reason: patch.reason?.trim() || null,
  })
  return data
}

/** The decision history for one creator, newest first. */
export async function listCreatorReviews(db: Db, p: Profile, influencerId: string) {
  const { data } = await db.from('creator_reviews')
    .select('id, actor_name, prev_entity_type, new_entity_type, prev_review_state, new_review_state, reason, created_at')
    .eq('workspace_id', p.workspace_id).eq('influencer_id', influencerId)
    .order('created_at', { ascending: false }).limit(50)
  return (data ?? []) as CreatorReviewRow[]
}

/**
 * Facet counts for the Creators filters and the Data quality page.
 *
 * Counted with `head: true` count queries, one per bucket, NOT by fetching rows
 * and grouping them in JS. PostgREST caps a plain select at 1,000 rows, so the
 * previous implementation silently reported the composition of the first
 * thousand records as if it were the whole catalog — 4,138 records were counted
 * as 1,000, and every percentage on the Data quality page was wrong.
 */
export async function getCreatorFacets(db: Db, p: Profile) {
  const countWhere = async (column: string, value: string) => {
    const q = applyCatalogScope(
      db.from('influencers').select('id', { count: 'exact', head: true }) as unknown as PgQuery,
      p.workspace_id,
    ).eq(column, value) as unknown as Promise<{ count: number | null }>
    return (await q).count ?? 0
  }

  // The distinct values are read once (cheap, and bounded by the enum-like
  // columns), then each one is counted exactly.
  const distinct = async (column: string): Promise<string[]> => {
    const q = applyCatalogScope(
      db.from('influencers').select(column) as unknown as PgQuery,
      p.workspace_id,
    ).order(column, { ascending: true }) as unknown as Promise<{ data: Record<string, string | null>[] | null }>
    const { data } = await q
    return [...new Set((data ?? []).map(r => r[column]).filter((v): v is string => !!v))]
  }

  const bucket = async (column: string) => {
    const values = await distinct(column)
    const counts = await Promise.all(values.map(v => countWhere(column, v)))
    return values
      .map((value, i) => ({ value, count: counts[i] }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
  }

  const [niche, platform, geo_status, entity_type, qualification_status, total] = await Promise.all([
    bucket('niche'), bucket('platform'), bucket('geo_status'),
    bucket('entity_type'), bucket('qualification_status'), countCatalog(db, p),
  ])
  return { niche, platform, geo_status, entity_type, qualification_status, total }
}

// ===========================================================================
// Outreach
// ===========================================================================

export async function listOutreach(
  db: Db, p: Profile, opts: { campaignId?: string; queue?: OutreachQueue; ownerId?: string; search?: string } = {},
): Promise<{ rows: OutreachRow[]; counts: Record<OutreachQueue, number> }> {
  const rows = await listCampaignCreators(db, p, {
    campaignId: opts.campaignId,
    ownerId: opts.ownerId,
  })
  const enriched: OutreachRow[] = rows.map(r => ({ ...r, queues: queuesFor(r) }))

  const counts = OUTREACH_QUEUE_META.reduce((acc, q) => {
    acc[q.key] = 0
    return acc
  }, {} as Record<OutreachQueue, number>)
  for (const r of enriched) for (const q of r.queues) counts[q]++

  let filtered = enriched
  if (opts.queue) filtered = filtered.filter(r => r.queues.includes(opts.queue!))
  if (opts.search) {
    const s = opts.search.toLowerCase()
    filtered = filtered.filter(r =>
      r.handle.toLowerCase().includes(s) || (r.full_name ?? '').toLowerCase().includes(s))
  }
  // Most urgent first: overdue follow-ups, then replies, then the rest.
  const t = todayStr()
  filtered.sort((a, b) => {
    const rank = (r: OutreachRow) =>
      r.next_follow_up && r.next_follow_up < t ? 0
      : r.queues.includes('replied') ? 1
      : r.next_follow_up === t ? 2 : 3
    const d = rank(a) - rank(b)
    if (d) return d
    return (a.next_follow_up ?? '9999') < (b.next_follow_up ?? '9999') ? -1 : 1
  })
  return { rows: filtered, counts }
}

/**
 * Log an outreach touch.
 *
 * Nothing is sent. The user copies the message into Instagram or their mail
 * client and records what they did here, which is why the row is named
 * "activity" rather than "message".
 */
export async function logOutreach(db: Db, p: Profile, input: Record<string, unknown>) {
  const ccId = str(input.campaign_creator_id)
  if (!ccId) throw new Error('Which campaign creator is this for?')
  const { data: cc } = await db.from('campaign_creators').select('id, handle, stage, owner_id')
    .eq('workspace_id', p.workspace_id).eq('id', ccId).maybeSingle()
  if (!cc) throw new Error('That campaign creator was not found.')
  if (p.role !== 'admin' && cc.owner_id && cc.owner_id !== p.id) throw new Error('This creator is owned by another team member.')

  const channels = ['instagram_dm', 'email', 'phone', 'whatsapp', 'other']
  const channel = channels.includes(String(input.channel)) ? String(input.channel) : 'other'
  const replies = ['none', 'awaiting', 'replied_positive', 'replied_negative', 'bounced']
  const reply = replies.includes(String(input.reply_status)) ? String(input.reply_status) : 'awaiting'
  const direction = input.direction === 'inbound' ? 'inbound' : 'outbound'

  const { data, error } = await db.from('outreach_activities').insert({
    workspace_id: p.workspace_id,
    campaign_creator_id: ccId,
    channel, direction,
    template_id: str(input.template_id),
    subject: str(input.subject),
    body: str(input.body),
    occurred_at: str(input.occurred_at) ?? nowIso(),
    reply_status: reply,
    next_follow_up: str(input.next_follow_up),
    notes: str(input.notes),
    logged_by: p.id,
  }).select('*').single()
  if (error) throw new Error(error.message)

  // Advance the relationship, but never move it backwards: a user logging a
  // late note on an agreed creator must not drag them back to "contacted".
  const ladder = CC_STAGES as readonly string[]
  const wanted =
    direction === 'inbound' || reply === 'replied_positive' || reply === 'replied_negative' ? 'replied'
    : 'contacted'
  const set: Record<string, unknown> = { last_touch: nowIso(), updated_at: nowIso() }
  if (ladder.indexOf(cc.stage) < ladder.indexOf(wanted)) set.stage = wanted
  if ('next_follow_up' in input) set.next_follow_up = str(input.next_follow_up)
  await db.from('campaign_creators').update(set).eq('workspace_id', p.workspace_id).eq('id', ccId)

  await logCrmActivity(db, p, 'notes_updated', cc.handle, { outreach: channel, reply })
  return data
}

export async function deleteOutreach(db: Db, p: Profile, id: string) {
  const { error } = await db.from('outreach_activities').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Offers
// ===========================================================================

const OFFER_STATUSES = new Set(['draft', 'sent', 'counter_offered', 'accepted', 'declined', 'withdrawn'])

export async function upsertOffer(db: Db, p: Profile, input: Record<string, unknown>): Promise<OfferRow> {
  const ccId = str(input.campaign_creator_id)
  if (!ccId) throw new Error('Which campaign creator is this offer for?')
  const { data: cc } = await db.from('campaign_creators').select('id, handle, stage, owner_id')
    .eq('workspace_id', p.workspace_id).eq('id', ccId).maybeSingle()
  if (!cc) throw new Error('That campaign creator was not found.')
  if (p.role !== 'admin' && cc.owner_id && cc.owner_id !== p.id) throw new Error('This creator is owned by another team member.')

  const type = OFFER_TYPES.has(String(input.offer_type)) ? String(input.offer_type) : 'gifted'
  const status = OFFER_STATUSES.has(String(input.status)) ? String(input.status) : 'draft'
  const row = {
    workspace_id: p.workspace_id,
    campaign_creator_id: ccId,
    offer_type: type,
    flat_fee: num(input.flat_fee),
    commission_pct: num(input.commission_pct),
    gifted_product: str(input.gifted_product),
    currency: str(input.currency) ?? 'USD',
    status,
    agreed_at: str(input.agreed_at),
    agreement_url: str(input.agreement_url),
    usage_rights: str(input.usage_rights),
    exclusivity: str(input.exclusivity),
    whitelisting: !!input.whitelisting,
    notes: str(input.notes),
    created_by: p.id,
    updated_at: nowIso(),
  }
  const { data, error } = await db.from('offers')
    .upsert(row, { onConflict: 'campaign_creator_id' }).select('*').single()
  if (error) throw new Error(error.message)

  // An accepted offer means the creator agreed; reflect that on the board
  // unless they are already further along.
  if (status === 'accepted') {
    const ladder = CC_STAGES as readonly string[]
    if (ladder.indexOf(cc.stage) < ladder.indexOf('agreed')) {
      await db.from('campaign_creators').update({ stage: 'agreed', last_touch: nowIso() })
        .eq('workspace_id', p.workspace_id).eq('id', ccId)
    }
  }
  return data as unknown as OfferRow
}

export async function listOffers(
  db: Db, p: Profile, opts: { campaignId?: string; status?: string } = {},
): Promise<(OfferRow & { handle: string; full_name: string | null; campaign_id: string; campaign_name: string | null; stage: string })[]> {
  const ccs = await listCampaignCreators(db, p, { campaignId: opts.campaignId })
  const byId = new Map(ccs.map(c => [c.id, c]))
  if (!ccs.length) return []
  let q = db.from('offers').select('*').eq('workspace_id', p.workspace_id).in('campaign_creator_id', [...byId.keys()])
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q.order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as OfferRow[]).map(o => {
    const cc = byId.get(o.campaign_creator_id)!
    return { ...o, handle: cc.handle, full_name: cc.full_name, campaign_id: cc.campaign_id, campaign_name: cc.campaign_name ?? null, stage: cc.stage }
  })
}

export async function deleteOffer(db: Db, p: Profile, id: string) {
  const { error } = await db.from('offers').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Deliverables
// ===========================================================================

const KINDS = new Set(['reel', 'post', 'story', 'video', 'short', 'livestream', 'ugc_asset', 'other'])
const APPROVALS = new Set(['planned', 'submitted', 'changes_requested', 'approved', 'published'])

export interface DeliverableListParams {
  campaignId?: string
  ccId?: string
  ownerId?: string
  view?: 'all' | 'due_soon' | 'overdue' | 'awaiting_approval' | 'published'
}

export type DeliverableWithContext = DeliverableRow & {
  handle: string
  full_name: string | null
  campaign_id: string
  campaign_name: string | null
  client_name: string | null
  product_name: string | null
  owner_name: string | null
}

export async function listDeliverables(
  db: Db, p: Profile, opts: DeliverableListParams = {},
): Promise<DeliverableWithContext[]> {
  const ccs = await listCampaignCreators(db, p, { campaignId: opts.campaignId, ownerId: opts.ownerId })
  const byId = new Map(ccs.map(c => [c.id, c]))
  if (!byId.size) return []
  let q = db.from('deliverables').select('*').eq('workspace_id', p.workspace_id)
  q = opts.ccId ? q.eq('campaign_creator_id', opts.ccId) : q.in('campaign_creator_id', [...byId.keys()])
  const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)

  const t = todayStr()
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  let rows = (data ?? []) as unknown as DeliverableRow[]
  switch (opts.view) {
    case 'due_soon':
      rows = rows.filter(d => d.due_date && d.due_date >= t && d.due_date <= soon && d.approval_state !== 'published'); break
    case 'overdue':
      rows = rows.filter(d => d.due_date && d.due_date < t && d.approval_state !== 'published'); break
    case 'awaiting_approval':
      rows = rows.filter(d => d.approval_state === 'submitted'); break
    case 'published':
      rows = rows.filter(d => d.approval_state === 'published'); break
  }
  return rows.filter(d => byId.has(d.campaign_creator_id)).map(d => {
    const cc = byId.get(d.campaign_creator_id)!
    return {
      ...d,
      handle: cc.handle, full_name: cc.full_name,
      campaign_id: cc.campaign_id, campaign_name: cc.campaign_name ?? null,
      client_name: cc.client_name ?? null, product_name: cc.product_name ?? null,
      owner_name: cc.owner_name,
    }
  })
}

export async function createDeliverable(db: Db, p: Profile, input: Record<string, unknown>) {
  const ccId = str(input.campaign_creator_id)
  if (!ccId) throw new Error('Which campaign creator is this deliverable for?')
  const { data: cc } = await db.from('campaign_creators').select('id, owner_id, handle, stage')
    .eq('workspace_id', p.workspace_id).eq('id', ccId).maybeSingle()
  if (!cc) throw new Error('That campaign creator was not found.')
  if (p.role !== 'admin' && cc.owner_id && cc.owner_id !== p.id) throw new Error('This creator is owned by another team member.')

  const { data, error } = await db.from('deliverables').insert({
    workspace_id: p.workspace_id,
    campaign_creator_id: ccId,
    platform: str(input.platform) ?? 'instagram',
    kind: KINDS.has(String(input.kind)) ? String(input.kind) : 'reel',
    title: str(input.title),
    brief: str(input.brief),
    due_date: str(input.due_date),
    created_by: p.id,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateDeliverable(db: Db, p: Profile, id: string, patch: Record<string, unknown>) {
  const { data: cur } = await db.from('deliverables').select('id, campaign_creator_id, approval_state')
    .eq('workspace_id', p.workspace_id).eq('id', id).maybeSingle()
  if (!cur) throw new Error('Deliverable not found.')
  const { data: cc } = await db.from('campaign_creators').select('id, owner_id, stage, handle')
    .eq('workspace_id', p.workspace_id).eq('id', cur.campaign_creator_id).maybeSingle()
  if (p.role !== 'admin' && cc?.owner_id && cc.owner_id !== p.id) throw new Error('This creator is owned by another team member.')

  const set: Record<string, unknown> = { updated_at: nowIso() }
  if ('platform' in patch) set.platform = str(patch.platform) ?? 'instagram'
  if ('kind' in patch && KINDS.has(String(patch.kind))) set.kind = patch.kind
  for (const k of ['title', 'brief', 'due_date', 'submitted_url', 'feedback', 'published_url', 'published_at'] as const)
    if (k in patch) set[k] = str(patch[k])
  for (const k of ['views', 'likes', 'comments_count', 'saves', 'clicks', 'conversions'] as const)
    // NULL is preserved deliberately: "not recorded" must not become 0.
    if (k in patch) set[k] = int(patch[k])

  if ('approval_state' in patch && APPROVALS.has(String(patch.approval_state))) {
    const next = String(patch.approval_state)
    set.approval_state = next
    if (next === 'submitted') set.submitted_at = str(patch.submitted_at) ?? nowIso()
    if (next === 'approved') set.approved_at = nowIso()
    if (next === 'published' && !('published_at' in patch)) set.published_at = todayStr()
  }

  const { data, error } = await db.from('deliverables').update(set)
    .eq('workspace_id', p.workspace_id).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)

  // Keep the board honest about where the work actually is.
  if (cc && set.approval_state) {
    const ladder = CC_STAGES as readonly string[]
    const target = set.approval_state === 'published' ? 'live' : 'content_in_progress'
    if (ladder.indexOf(cc.stage) < ladder.indexOf(target)) {
      await db.from('campaign_creators').update({ stage: target, last_touch: nowIso() })
        .eq('workspace_id', p.workspace_id).eq('id', cc.id)
    }
  }
  return data
}

export async function deleteDeliverable(db: Db, p: Profile, id: string) {
  const { error } = await db.from('deliverables').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

/** Create the campaign's planned deliverables for one creator in a single step. */
export async function applyDeliverablePlan(db: Db, p: Profile, ccId: string): Promise<{ created: number }> {
  const { data: cc } = await db.from('campaign_creators').select('id, campaign_id, owner_id')
    .eq('workspace_id', p.workspace_id).eq('id', ccId).maybeSingle()
  if (!cc) throw new Error('That campaign creator was not found.')
  const campaign = await getCampaignV2(db, p, cc.campaign_id)
  const plan = campaign.deliverable_plan ?? []
  if (!plan.length) throw new Error('This campaign has no deliverable plan yet. Add one on the campaign’s Overview tab.')

  const rows: Record<string, unknown>[] = []
  for (const item of plan) {
    const qty = Math.max(1, Math.min(Number(item.quantity) || 1, 20))
    for (let i = 0; i < qty; i++) {
      rows.push({
        workspace_id: p.workspace_id,
        campaign_creator_id: ccId,
        platform: item.platform ?? 'instagram',
        kind: KINDS.has(item.kind) ? item.kind : 'reel',
        title: qty > 1 ? `${item.kind} ${i + 1}` : null,
        due_date: item.due_offset_days != null
          ? new Date(Date.now() + Number(item.due_offset_days) * 864e5).toISOString().slice(0, 10)
          : campaign.end_date,
        created_by: p.id,
      })
    }
  }
  const { data, error } = await db.from('deliverables').insert(rows).select('id')
  if (error) throw new Error(error.message)
  return { created: data?.length ?? 0 }
}

// ===========================================================================
// Today
// ===========================================================================

/**
 * The dashboard: seven counts and three short lists.
 *
 * Every number is a count query against the catalog scope the Influencers page
 * uses, so a number here and the list it links to can never disagree.
 */
export async function getDashboard(db: Db, p: Profile): Promise<DashboardResponse> {
  const t = todayStr()
  const showDemo = await demoVisible()

  const catalog = (extra?: (q: PgQuery) => PgQuery) => {
    let q = applyCatalogScope(
      db.from('influencers').select('id', { count: 'exact', head: true }) as unknown as PgQuery,
      p.workspace_id)
    if (extra) q = extra(q)
    return q as unknown as Promise<{ count: number | null }>
  }

  const [total, withEmail, withPhone, usBased, campaignsAll, ccs] = await Promise.all([
    catalog(),
    catalog(q => q.not('email', 'is', null)),
    catalog(q => q.not('phone', 'is', null)),
    catalog(q => q.in('geo_status', ['confirmed_us', 'likely_us'])),
    listCampaignsV2(db, p),
    listCampaignCreators(db, p, {}),
  ])

  const notContacted = ccs.filter(c => c.stage === 'not_contacted').length
  const followUpsDue = ccs.filter(c =>
    c.next_follow_up && c.next_follow_up <= t && !CLOSED_STAGES.includes(c.stage as never)).length

  const line = (c: CampaignCreator) => ({
    campaign_creator_id: c.id,
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name ?? '',
    handle: c.handle,
    full_name: c.full_name,
    stage: c.stage,
    date: c.next_follow_up,
    channel: c.outreach_channel ?? null,
  })

  return {
    stats: {
      total: total.count ?? 0,
      withEmail: withEmail.count ?? 0,
      withPhone: withPhone.count ?? 0,
      usBased: usBased.count ?? 0,
      notContacted,
      followUpsDue,
      activeCampaigns: campaignsAll.filter(c => c.status === 'active').length,
    },
    // Due today OR already overdue — an overdue follow-up is still due.
    followUpsToday: ccs
      .filter(c => c.next_follow_up && c.next_follow_up <= t && !CLOSED_STAGES.includes(c.stage as never))
      .sort((a, b) => (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? ''))
      .slice(0, 8).map(line),
    recentReplies: ccs
      .filter(c => c.stage === 'replied' || c.stage === 'interested')
      .sort((a, b) => (b.last_contacted_on ?? '').localeCompare(a.last_contacted_on ?? ''))
      .slice(0, 8).map(line),
    activeCampaigns: campaignsAll
      .filter(c => c.status === 'active')
      .slice(0, 6)
      .map(c => ({
        id: c.id, name: c.name,
        client_name: c.client_name, product_name: c.product_name,
        creators: c.stats.creators,
        contacted: c.stats.contacted,
        replied: c.stats.replied,
        interested: c.stats.interested,
        demo_run_id: c.demo_run_id ?? null,
      })),
    demoRows: showDemo ? 0 : 0,
  }
}

export async function getToday(db: Db, p: Profile): Promise<TodayResponse> {
  const showDemo = await demoVisible()
  const t = todayStr()
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

  const [
    { count: clients }, { count: products }, { count: templates }, catalog,
    campaigns, ccs, { data: activity },
  ] = await Promise.all([
    hideDemo(db.from('clients').select('id', { count: 'exact', head: true }).eq('workspace_id', p.workspace_id), showDemo),
    hideDemo(db.from('products').select('id', { count: 'exact', head: true }).eq('workspace_id', p.workspace_id), showDemo),
    hideDemo(db.from('templates').select('id', { count: 'exact', head: true }).eq('workspace_id', p.workspace_id), showDemo),
    countCatalog(db, p),
    listCampaignsV2(db, p),
    listCampaignCreators(db, p, {}),
    db.from('activity_log').select('id, user_name, action, profile_handle, created_at, metadata')
      .eq('workspace_id', p.workspace_id).order('created_at', { ascending: false }).limit(15),
  ])

  const campById = new Map(campaigns.map(c => [c.id, c]))
  const toItem = (cc: CampaignCreator, date: string | null, detail: string | null) => {
    const camp = campById.get(cc.campaign_id)
    return {
      campaign_creator_id: cc.id, campaign_id: cc.campaign_id,
      campaign_name: camp?.name ?? cc.campaign_name ?? 'Campaign',
      client_name: camp?.client_name ?? null, product_name: camp?.product_name ?? null,
      handle: cc.handle, full_name: cc.full_name, stage: cc.stage,
      owner_name: cc.owner_name, date, detail,
    }
  }

  const open = ccs.filter(c => !CLOSED_STAGES.includes(c.stage as never))
  const followUpsOverdue = open
    .filter(c => c.next_follow_up && c.next_follow_up < t)
    .sort((a, b) => (a.next_follow_up! < b.next_follow_up! ? -1 : 1))
    .slice(0, 12)
    .map(c => toItem(c, c.next_follow_up, `${ccStageLabel(c.stage)} · follow-up was due ${c.next_follow_up}`))
  const followUpsToday = open
    .filter(c => c.next_follow_up === t)
    .slice(0, 12)
    .map(c => toItem(c, c.next_follow_up, ccStageLabel(c.stage)))

  const recentReplies = ccs
    .filter(c => c.last_reply_status === 'replied_positive' || c.last_reply_status === 'replied_negative' || c.stage === 'replied')
    .sort((a, b) => (b.last_outreach_at ?? '') > (a.last_outreach_at ?? '') ? 1 : -1)
    .slice(0, 10)
    .map(c => toItem(c, c.last_outreach_at, c.last_reply_status === 'replied_negative' ? 'Replied — not interested' : 'Replied — interested'))

  // Deliverables need one extra query: the aggregate on the relationship row
  // only carries counts, not the individual due items.
  const ccIds = ccs.map(c => c.id)
  const { data: dlv } = ccIds.length
    ? await db.from('deliverables').select('id, campaign_creator_id, kind, title, due_date, approval_state')
        .eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds)
    : { data: [] as Record<string, unknown>[] }
  const ccById = new Map(ccs.map(c => [c.id, c]))
  const toDlv = (d: Record<string, unknown>) => {
    const cc = ccById.get(d.campaign_creator_id as string)!
    return {
      id: d.id as string, campaign_creator_id: cc.id, campaign_id: cc.campaign_id,
      campaign_name: cc.campaign_name ?? 'Campaign', handle: cc.handle,
      kind: d.kind as string, title: (d.title as string) ?? null,
      due_date: (d.due_date as string) ?? null, approval_state: d.approval_state as string,
      owner_name: cc.owner_name,
    }
  }
  const deliverablesDue = (dlv ?? [])
    .filter(d => d.due_date && String(d.due_date) <= soon && d.approval_state !== 'published' && ccById.has(d.campaign_creator_id as string))
    .sort((a, b) => (String(a.due_date) < String(b.due_date) ? -1 : 1))
    .slice(0, 12).map(toDlv)
  const awaitingApproval = (dlv ?? [])
    .filter(d => d.approval_state === 'submitted' && ccById.has(d.campaign_creator_id as string))
    .slice(0, 12).map(toDlv)

  // "At risk" is stated as reasons, not a score, so the user can act on it.
  const campaignsAtRisk = campaigns
    .filter(c => c.status === 'active' || c.status === 'planning')
    .map(c => {
      const reasons: string[] = []
      if (c.stats.followUpsOverdue > 0) reasons.push(`${c.stats.followUpsOverdue} follow-up${c.stats.followUpsOverdue === 1 ? '' : 's'} overdue`)
      if (c.stats.deliverablesOverdue > 0) reasons.push(`${c.stats.deliverablesOverdue} deliverable${c.stats.deliverablesOverdue === 1 ? '' : 's'} overdue`)
      if (c.end_date && c.end_date < t && c.status === 'active') reasons.push(`End date passed on ${c.end_date}`)
      if (c.brief_creator_target && c.stats.creators < c.brief_creator_target) {
        reasons.push(`${c.stats.creators} of ${c.brief_creator_target} creators added`)
      }
      if (c.status === 'active' && c.stats.creators === 0) reasons.push('Active with no creators added')
      return {
        id: c.id, name: c.name, client_name: c.client_name, product_name: c.product_name,
        status: c.status, end_date: c.end_date, reasons,
        creators: c.stats.creators, target: c.brief_creator_target,
      }
    })
    .filter(c => c.reasons.length)
    .slice(0, 8)

  const activeCampaigns = campaigns
    .filter(c => c.status === 'active' || c.status === 'planning')
    .slice(0, 8)
    .map(c => ({
      id: c.id, name: c.name, client_name: c.client_name, product_name: c.product_name,
      status: c.status, creators: c.stats.creators, contacted: c.stats.contacted,
      replied: c.stats.replied, interested: c.stats.interested,
      followUpsOverdue: c.stats.followUpsOverdue,
    }))

  return {
    hasAnyOperationalData: campaigns.length > 0 || ccs.length > 0,
    counts: {
      clients: clients ?? 0, products: products ?? 0, campaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
      creatorsInCampaigns: new Set(ccs.map(c => c.influencer_id)).size,
      catalog, templates: templates ?? 0,
    },
    followUpsOverdue, followUpsToday, recentReplies,
    deliverablesDue, awaitingApproval, campaignsAtRisk, activeCampaigns,
    recentActivity: (activity ?? []) as TodayResponse['recentActivity'],
  }
}

// ===========================================================================
// Templates
// ===========================================================================

const TEMPLATE_COLS = 'id, name, channel, campaign_id, product_id, subject, body, follow_ups, tags, created_at, updated_at, demo_run_id'

export async function listTemplatesV2(db: Db, p: Profile): Promise<TemplateRow[]> {
  const [{ data, error }, maps, { data: camps }] = await Promise.all([
    hideDemo(db.from('templates').select(TEMPLATE_COLS).eq('workspace_id', p.workspace_id), await demoVisible())
      .order('updated_at', { ascending: false }),
    lookupMaps(db, p),
    db.from('campaigns').select('id, name').eq('workspace_id', p.workspace_id),
  ])
  if (error) throw new Error(error.message)
  const campName = new Map((camps ?? []).map(c => [c.id, c.name]))
  return (data ?? []).map(r => ({
    ...(r as unknown as TemplateRow),
    follow_ups: Array.isArray(r.follow_ups) ? r.follow_ups as TemplateRow['follow_ups'] : [],
    campaign_name: r.campaign_id ? (campName.get(r.campaign_id) ?? null) : null,
    product_name: r.product_id ? (maps.productName.get(r.product_id) ?? null) : null,
  }))
}

function templateFields(input: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {}
  if ('name' in input) { const n = str(input.name); if (!n) throw new Error('Template name is required.'); set.name = n }
  if ('channel' in input) set.channel = input.channel === 'email' ? 'email' : 'instagram_dm'
  if ('campaign_id' in input) set.campaign_id = str(input.campaign_id)
  if ('product_id' in input) set.product_id = str(input.product_id)
  if ('subject' in input) set.subject = str(input.subject)
  if ('body' in input) { const b = str(input.body); if (!b) throw new Error('The first message cannot be empty.'); set.body = b }
  if ('tags' in input) set.tags = arr(input.tags)
  if ('follow_ups' in input) {
    const raw = Array.isArray(input.follow_ups) ? input.follow_ups : []
    set.follow_ups = raw.slice(0, 6).map((f, i) => {
      const step = f as Record<string, unknown>
      return {
        step: i + 1,
        delay_days: Math.max(1, Math.min(int(step.delay_days) ?? 3, 90)),
        subject: str(step.subject),
        body: str(step.body) ?? '',
      }
    }).filter(f => f.body)
  }
  return set
}

export async function createTemplateV2(db: Db, p: Profile, input: Record<string, unknown>) {
  const set = templateFields(input)
  if (!set.name || !set.body) throw new Error('A template needs a name and a first message.')
  const { data, error } = await db.from('templates')
    .insert({ workspace_id: p.workspace_id, created_by: p.id, updated_by: p.id, ...set })
    .select(TEMPLATE_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateTemplateV2(db: Db, p: Profile, id: string, patch: Record<string, unknown>) {
  const set = templateFields(patch)
  set.updated_at = nowIso()
  set.updated_by = p.id
  const { data, error } = await db.from('templates').update(set)
    .eq('workspace_id', p.workspace_id).eq('id', id).select(TEMPLATE_COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteTemplateV2(db: Db, p: Profile, id: string) {
  const { error } = await db.from('templates').delete().eq('workspace_id', p.workspace_id).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ===========================================================================
// Analytics
// ===========================================================================

/**
 * Every number here is counted from a stored row.
 *
 * There is no ROAS, no revenue and no engagement rate, because nothing in this
 * database records a sale or an impression. Where a metric depends on manually
 * entered numbers, the payload also reports HOW MANY rows actually carry them,
 * so the UI can say "views across 3 of 11 published deliverables" instead of
 * implying full coverage.
 */
export async function getAnalyticsV2(db: Db, p: Profile, f: AnalyticsFilters = {}): Promise<AnalyticsPayload> {
  const campaigns = await listCampaignsV2(db, p)
  let scoped = campaigns
  if (f.clientId) scoped = scoped.filter(c => c.client_id === f.clientId)
  if (f.productId) scoped = scoped.filter(c => c.product_id === f.productId)
  if (f.campaignId) scoped = scoped.filter(c => c.id === f.campaignId)
  const campIds = new Set(scoped.map(c => c.id))

  let ccs = await listCampaignCreators(db, p, {})
  ccs = ccs.filter(c => campIds.has(c.campaign_id))
  if (f.from) ccs = ccs.filter(c => c.added_at >= f.from!)
  if (f.to) ccs = ccs.filter(c => c.added_at <= f.to! + 'T23:59:59Z')
  const ccIds = ccs.map(c => c.id)

  const [{ data: outreach }, { data: dlv }, { data: offers }, { data: users }] = await Promise.all([
    ccIds.length ? db.from('outreach_activities').select('campaign_creator_id, channel, direction, occurred_at, reply_status')
      .eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds) : Promise.resolve({ data: [] }),
    ccIds.length ? db.from('deliverables').select('*').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds) : Promise.resolve({ data: [] }),
    ccIds.length ? db.from('offers').select('*').eq('workspace_id', p.workspace_id).in('campaign_creator_id', ccIds) : Promise.resolve({ data: [] }),
    db.from('users').select('id, name').eq('workspace_id', p.workspace_id),
  ])

  const ladder = CC_STAGES as readonly string[]
  const atOrPast = (stage: string, target: string) =>
    stage !== 'rejected' && ladder.indexOf(stage) >= ladder.indexOf(target)

  const funnelStages = ['shortlisted', 'ready_to_contact', 'contacted', 'replied', 'negotiating', 'agreed', 'live', 'completed']
  const funnel = funnelStages.map(s => ({
    stage: s, label: ccStageLabel(s), count: ccs.filter(c => atOrPast(c.stage, s)).length,
  }))
  const rate = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10)
  const conversion = funnel.slice(0, -1).map((step, i) => ({
    from: step.stage, to: funnel[i + 1].stage,
    label: `${step.label} → ${funnel[i + 1].label}`,
    rate: rate(funnel[i + 1].count, step.count),
  }))

  // Response time: first outbound touch to the first inbound reply per creator.
  const firstOut = new Map<string, number>()
  const firstIn = new Map<string, number>()
  let replies = 0, positive = 0
  for (const o of (outreach ?? []) as Record<string, unknown>[]) {
    const cc = o.campaign_creator_id as string
    const at = new Date(o.occurred_at as string).getTime()
    if (o.direction === 'outbound') {
      if (!firstOut.has(cc) || at < firstOut.get(cc)!) firstOut.set(cc, at)
    } else if (!firstIn.has(cc) || at < firstIn.get(cc)!) firstIn.set(cc, at)
    if (o.reply_status === 'replied_positive' || o.reply_status === 'replied_negative') replies++
    if (o.reply_status === 'replied_positive') positive++
  }
  const gaps: number[] = []
  for (const [cc, inAt] of firstIn) {
    const outAt = firstOut.get(cc)
    if (outAt && inAt > outAt) gaps.push((inAt - outAt) / 3.6e6)
  }
  gaps.sort((a, b) => a - b)
  const medianResponseHours = gaps.length
    ? Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10
    : null

  const contacted = ccs.filter(c => atOrPast(c.stage, 'contacted')).length
  const repliedCreators = ccs.filter(c => atOrPast(c.stage, 'replied')).length

  const deliverables = (dlv ?? []) as unknown as DeliverableRow[]
  const t = todayStr()
  const published = deliverables.filter(d => d.approval_state === 'published')
  const sumOrNull = (key: keyof DeliverableRow) => {
    const vals = published.map(d => d[key]).filter(v => v != null) as number[]
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null
  }
  const recordedViews = published.filter(d => d.views != null).length

  const acceptedOffers = ((offers ?? []) as unknown as OfferRow[]).filter(o => o.status === 'accepted')
  const feeVals = acceptedOffers.map(o => o.flat_fee).filter(v => v != null) as number[]
  const committedSpend = feeVals.length ? feeVals.reduce((a, b) => a + Number(b), 0) : null

  const byCampaign = scoped.map(c => {
    const mine = ccs.filter(x => x.campaign_id === c.id)
    const mineIds = new Set(mine.map(x => x.id))
    const pub = published.filter(d => mineIds.has(d.campaign_creator_id))
    const viewVals = pub.map(d => d.views).filter(v => v != null) as number[]
    return {
      id: c.id, name: c.name, client_name: c.client_name, product_name: c.product_name,
      creators: mine.length,
      contacted: mine.filter(x => atOrPast(x.stage, 'contacted')).length,
      replied: mine.filter(x => atOrPast(x.stage, 'replied')).length,
      agreed: mine.filter(x => atOrPast(x.stage, 'agreed')).length,
      live: mine.filter(x => x.stage === 'live' || x.stage === 'completed').length,
      published: pub.length,
      views: viewVals.length ? viewVals.reduce((a, b) => a + b, 0) : null,
    }
  }).sort((a, b) => b.creators - a.creators)

  const userName = new Map((users ?? []).map(u => [u.id, u.name]))
  const ownerIds = [...new Set(ccs.map(c => c.owner_id))]
  const byOwner = ownerIds.map(id => {
    const mine = ccs.filter(c => c.owner_id === id)
    return {
      id, name: id ? (userName.get(id) ?? 'Unknown') : 'Unassigned',
      creators: mine.length,
      contacted: mine.filter(x => atOrPast(x.stage, 'contacted')).length,
      replied: mine.filter(x => atOrPast(x.stage, 'replied')).length,
      agreed: mine.filter(x => atOrPast(x.stage, 'agreed')).length,
    }
  }).sort((a, b) => b.creators - a.creators)

  const label = f.campaignId ? (scoped[0]?.name ?? 'Campaign')
    : f.productId ? (scoped[0]?.product_name ?? 'Product')
    : f.clientId ? (scoped[0]?.client_name ?? 'Client')
    : 'All campaigns'

  return {
    scope: { campaigns: scoped.length, label },
    funnel, conversion,
    outreach: {
      messagesLogged: (outreach ?? []).length,
      creatorsContacted: contacted,
      replies, positiveReplies: positive,
      replyRate: rate(repliedCreators, contacted),
      positiveRate: rate(positive, Math.max(replies, 1)) != null && replies > 0 ? rate(positive, replies) : null,
      medianResponseHours,
    },
    agreements: {
      agreed: ccs.filter(c => atOrPast(c.stage, 'agreed')).length,
      offersAccepted: acceptedOffers.length,
      committedSpend,
      currency: acceptedOffers[0]?.currency ?? 'USD',
    },
    deliverables: {
      planned: deliverables.length,
      submitted: deliverables.filter(d => d.approval_state === 'submitted').length,
      approved: deliverables.filter(d => d.approval_state === 'approved').length,
      published: published.length,
      overdue: deliverables.filter(d => d.due_date && d.due_date < t && d.approval_state !== 'published').length,
    },
    content: {
      views: sumOrNull('views'),
      likes: sumOrNull('likes'),
      comments: sumOrNull('comments_count'),
      recorded: recordedViews,
      total: published.length,
    },
    performance: {
      clicks: sumOrNull('clicks'),
      conversions: sumOrNull('conversions'),
    },
    byCampaign, byOwner,
  }
}
