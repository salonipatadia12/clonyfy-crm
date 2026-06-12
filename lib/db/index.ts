import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { SCHEMA } from './schema'

// ---- Connection singleton ---------------------------------------------------

let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (_db) return _db
  const dataDir = path.join(process.cwd(), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(dataDir, 'clonify.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  _db = db
  return db
}

// ---- Row shapes -------------------------------------------------------------

export interface InfluencerRow {
  id: string
  handle: string
  name: string
  follower_count: number | null
  following_count: number | null
  posts_count: number | null
  engagement_rate: number | null
  avg_likes: number | null
  eng_quality: string | null
  account_type: string | null
  category: string | null
  niche: string | null
  market: string | null
  country_seed: string | null
  is_verified: number
  is_private: number
  quality_tier: string | null
  bio_link: string | null
  biography: string | null
  email: string | null
  profile_url: string | null
  avatar_url: string | null
  stage: string
  priority: string
  scraped_at: string | null
  created_at: string
  updated_at: string
}

export interface ListParams {
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

const SORTABLE = new Set([
  'follower_count', 'engagement_rate', 'avg_likes', 'name', 'handle',
  'quality_tier', 'stage', 'updated_at', 'created_at',
])

function buildWhere(p: ListParams): { clause: string; args: unknown[] } {
  const conds: string[] = []
  const args: (string | number)[] = []
  if (p.search) {
    conds.push('(handle LIKE ? OR name LIKE ? OR biography LIKE ? OR category LIKE ?)')
    const q = `%${p.search}%`
    args.push(q, q, q, q)
  }
  const inFilter = (col: string, vals?: string[]) => {
    if (vals && vals.length) {
      conds.push(`${col} IN (${vals.map(() => '?').join(',')})`)
      args.push(...vals)
    }
  }
  inFilter('niche', p.niche)
  inFilter('quality_tier', p.tier)
  inFilter('stage', p.stage)
  inFilter('market', p.market)
  inFilter('account_type', p.accountType)
  if (p.verifiedOnly) conds.push('is_verified = 1')
  if (typeof p.minFollowers === 'number') { conds.push('follower_count >= ?'); args.push(p.minFollowers) }
  if (typeof p.maxFollowers === 'number') { conds.push('follower_count <= ?'); args.push(p.maxFollowers) }
  return { clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args }
}

export function listInfluencers(p: ListParams) {
  const db = getDb()
  const { clause, args } = buildWhere(p)
  const total = (db.prepare(`SELECT COUNT(*) n FROM influencers ${clause}`).get(...(args as any[])) as { n: number }).n

  const sort = p.sort && SORTABLE.has(p.sort) ? p.sort : 'follower_count'
  const order = p.order === 'asc' ? 'ASC' : 'DESC'
  const pageSize = Math.min(Math.max(p.pageSize ?? 50, 1), 500)
  const page = Math.max(p.page ?? 1, 1)
  const offset = (page - 1) * pageSize

  // NULLS LAST for numeric sorts so empty metrics sink to the bottom.
  const rows = db.prepare(
    `SELECT * FROM influencers ${clause}
     ORDER BY (${sort} IS NULL), ${sort} ${order}
     LIMIT ? OFFSET ?`
  ).all(...(args as any[]), pageSize, offset) as unknown as InfluencerRow[]

  return { rows, total, page, pageSize }
}

export function getInfluencer(id: string): InfluencerRow | undefined {
  return getDb().prepare('SELECT * FROM influencers WHERE id = ?').get(id) as InfluencerRow | undefined
}

const EDITABLE = new Set(['stage', 'priority', 'email', 'name', 'avatar_url', 'biography'])

export function updateInfluencer(id: string, patch: Record<string, unknown>) {
  const db = getDb()
  const keys = Object.keys(patch).filter(k => EDITABLE.has(k))
  if (!keys.length) return getInfluencer(id)
  const sets = keys.map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE influencers SET ${sets}, updated_at = ? WHERE id = ?`)
    .run(...(keys.map(k => patch[k]) as (string | number | null)[]), new Date().toISOString(), id)
  return getInfluencer(id)
}

export function moveStage(id: string, toStage: string, note?: string) {
  const db = getDb()
  const cur = getInfluencer(id)
  if (!cur) throw new Error('influencer not found')
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE influencers SET stage = ?, updated_at = ? WHERE id = ?').run(toStage, now, id)
    db.prepare('INSERT INTO pipeline_entries (influencer_id, from_stage, to_stage, note, changed_at) VALUES (?,?,?,?,?)')
      .run(id, cur.stage, toStage, note ?? null, now)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return getInfluencer(id)
}

// ---- Notes ------------------------------------------------------------------

export function listNotes(influencerId: string) {
  return getDb().prepare('SELECT * FROM notes WHERE influencer_id = ? ORDER BY created_at DESC').all(influencerId)
}
export function addNote(influencerId: string, content: string) {
  const now = new Date().toISOString()
  const info = getDb().prepare('INSERT INTO notes (influencer_id, content, created_at) VALUES (?,?,?)').run(influencerId, content, now)
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid)
}

// ---- Pipeline history -------------------------------------------------------

export function listPipelineEntries(influencerId: string) {
  return getDb().prepare('SELECT * FROM pipeline_entries WHERE influencer_id = ? ORDER BY changed_at DESC').all(influencerId)
}

// ---- Deals (collaborations) -------------------------------------------------

export interface DealInput {
  influencer_id: string
  title: string
  status?: string
  deal_value?: number | null
  currency?: string
  start_date?: string | null
  end_date?: string | null
  deliverables?: string[]
  notes?: string | null
}

export function listDeals(influencerId?: string) {
  const db = getDb()
  if (influencerId) {
    return db.prepare(`SELECT c.*, i.name as influencer_name, i.handle as influencer_handle
                       FROM collaborations c JOIN influencers i ON i.id = c.influencer_id
                       WHERE c.influencer_id = ? ORDER BY c.created_at DESC`).all(influencerId)
  }
  return db.prepare(`SELECT c.*, i.name as influencer_name, i.handle as influencer_handle
                     FROM collaborations c JOIN influencers i ON i.id = c.influencer_id
                     ORDER BY c.created_at DESC`).all()
}

export function addDeal(d: DealInput) {
  const now = new Date().toISOString()
  const info = getDb().prepare(
    `INSERT INTO collaborations (influencer_id, title, status, deal_value, currency, start_date, end_date, deliverables, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    d.influencer_id, d.title, d.status ?? 'active', d.deal_value ?? null, d.currency ?? 'USD',
    d.start_date ?? null, d.end_date ?? null, JSON.stringify(d.deliverables ?? []), d.notes ?? null, now,
  )
  return getDb().prepare('SELECT * FROM collaborations WHERE id = ?').get(info.lastInsertRowid)
}

export function updateDeal(id: number, patch: Record<string, unknown>) {
  const db = getDb()
  const allowed = ['title', 'status', 'deal_value', 'currency', 'start_date', 'end_date', 'notes']
  const keys = Object.keys(patch).filter(k => allowed.includes(k))
  if (keys.length) {
    db.prepare(`UPDATE collaborations SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...(keys.map(k => patch[k]) as (string | number | null)[]), id)
  }
  return db.prepare('SELECT * FROM collaborations WHERE id = ?').get(id)
}

// ---- Segments ---------------------------------------------------------------

export function listSegments() {
  return getDb().prepare('SELECT * FROM segments ORDER BY created_at DESC').all()
}
export function addSegment(name: string, filters: unknown) {
  const now = new Date().toISOString()
  const info = getDb().prepare('INSERT INTO segments (name, filters, created_at) VALUES (?,?,?)')
    .run(name, JSON.stringify(filters), now)
  return getDb().prepare('SELECT * FROM segments WHERE id = ?').get(info.lastInsertRowid)
}
export function deleteSegment(id: number) {
  getDb().prepare('DELETE FROM segments WHERE id = ?').run(id)
}

// ---- Aggregate stats --------------------------------------------------------

const ACTIVE_STAGES = ['Negotiating', 'Deal Closed', 'Live']
const CLOSED_STAGES = ['Deal Closed', 'Live', 'Completed']

export function getStats() {
  const db = getDb()
  const totals = db.prepare(`
    SELECT COUNT(*) total,
           COALESCE(SUM(follower_count),0) reach,
           COALESCE(AVG(NULLIF(engagement_rate,0)),0) avg_eng
    FROM influencers`).get() as { total: number; reach: number; avg_eng: number }

  const byStage = db.prepare('SELECT stage, COUNT(*) count, COALESCE(SUM(follower_count),0) reach FROM influencers GROUP BY stage').all() as { stage: string; count: number; reach: number }[]
  const byTier = db.prepare('SELECT quality_tier tier, COUNT(*) count FROM influencers GROUP BY quality_tier').all() as { tier: string; count: number }[]
  const byNiche = db.prepare('SELECT niche, COUNT(*) count, COALESCE(SUM(follower_count),0) reach FROM influencers WHERE niche IS NOT NULL AND niche != \'\' GROUP BY niche ORDER BY count DESC').all() as { niche: string; count: number; reach: number }[]
  const byEng = db.prepare('SELECT eng_quality, COUNT(*) count FROM influencers WHERE eng_quality IS NOT NULL AND eng_quality != \'\' GROUP BY eng_quality').all() as { eng_quality: string; count: number }[]

  const tierA = byTier.find(t => t.tier === 'A')?.count ?? 0
  const activeDeals = byStage.filter(s => ACTIVE_STAGES.includes(s.stage)).reduce((a, s) => a + s.count, 0)
  const closedCount = byStage.filter(s => CLOSED_STAGES.includes(s.stage)).reduce((a, s) => a + s.count, 0)

  const deals = db.prepare(`
    SELECT COUNT(*) deal_count,
           COALESCE(SUM(deal_value),0) total_value,
           COALESCE(SUM(CASE WHEN status='completed' THEN deal_value ELSE 0 END),0) revenue_won,
           COALESCE(SUM(CASE WHEN status='active' THEN deal_value ELSE 0 END),0) pipeline_value
    FROM collaborations`).get() as { deal_count: number; total_value: number; revenue_won: number; pipeline_value: number }

  // scatter: sample of engaged creators for the engagement-vs-followers plot
  const scatter = db.prepare(`
    SELECT handle, follower_count x, engagement_rate y, quality_tier tier
    FROM influencers
    WHERE follower_count > 0 AND engagement_rate > 0 AND engagement_rate <= 60
    ORDER BY follower_count DESC LIMIT 400`).all()

  return {
    totals: { ...totals, tierA, activeDeals, closedCount },
    byStage, byTier, byNiche, byEng, deals, scatter,
  }
}

// ---- Dashboard overview (rich single payload) -------------------------------

const DAYS = 30
const dayKey = (iso: string) => iso.slice(0, 10)

export function getOverview() {
  const db = getDb()
  const base = getStats()

  // Build a 30-day scaffold.
  const today = new Date()
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const idx = new Map(days.map((d, i) => [d, i]))

  // Pull raw events (real timestamps from CRM activity).
  const pipe = db.prepare('SELECT changed_at FROM pipeline_entries').all() as { changed_at: string }[]
  const notes = db.prepare('SELECT created_at FROM notes').all() as { created_at: string }[]
  const deals = db.prepare('SELECT created_at, deal_value, status FROM collaborations').all() as { created_at: string; deal_value: number | null; status: string }[]

  const activity = new Array(DAYS).fill(0)
  const dealValueByDay = new Array(DAYS).fill(0)
  const revenueByDay = new Array(DAYS).fill(0)

  const bump = (iso: string, arr: number[], v = 1) => {
    const i = idx.get(dayKey(iso))
    if (i != null) arr[i] += v
  }
  pipe.forEach(p => bump(p.changed_at, activity))
  notes.forEach(n => bump(n.created_at, activity))
  deals.forEach(d => {
    bump(d.created_at, activity)
    bump(d.created_at, dealValueByDay, d.deal_value || 0)
    if (d.status === 'completed') bump(d.created_at, revenueByDay, d.deal_value || 0)
  })

  // Cumulative revenue line.
  let run = 0
  const revenueCumulative = revenueByDay.map(v => (run += v))

  const series = days.map((date, i) => ({
    date,
    activity: activity[i],
    dealValue: dealValueByDay[i],
    revenue: revenueCumulative[i],
  }))

  // Deltas: last 7 days vs the 7 before.
  const sum = (arr: number[], a: number, b: number) => arr.slice(a, b).reduce((x, y) => x + y, 0)
  const act7 = sum(activity, DAYS - 7, DAYS)
  const actPrev7 = sum(activity, DAYS - 14, DAYS - 7)
  const pctDelta = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100)

  // Conversion: share of worked creators that reached a closed stage.
  const worked = base.byStage.filter(s => s.stage !== 'Prospecting').reduce((a, s) => a + s.count, 0)
  const conversion = worked ? (base.totals.closedCount / worked) * 100 : 0

  // Leaderboard: biggest creators currently in the active pipeline.
  const leaderboard = db.prepare(
    `SELECT id, handle, name, follower_count, engagement_rate, quality_tier, stage
     FROM influencers WHERE stage != 'Prospecting'
     ORDER BY follower_count DESC LIMIT 6`
  ).all()

  // Live activity feed (most recent events across sources).
  const feed = db.prepare(`
    SELECT * FROM (
      SELECT 'stage' kind, p.changed_at ts, p.to_stage detail, p.from_stage extra, i.name name, i.handle handle
        FROM pipeline_entries p JOIN influencers i ON i.id = p.influencer_id
      UNION ALL
      SELECT 'deal' kind, c.created_at ts, c.title detail, CAST(COALESCE(c.deal_value,0) AS TEXT) extra, i.name name, i.handle handle
        FROM collaborations c JOIN influencers i ON i.id = c.influencer_id
      UNION ALL
      SELECT 'note' kind, n.created_at ts, n.content detail, NULL extra, i.name name, i.handle handle
        FROM notes n JOIN influencers i ON i.id = n.influencer_id
    ) ORDER BY ts DESC LIMIT 12
  `).all()

  return {
    ...base,
    series,
    conversion,
    worked,
    deltas: {
      activity: pctDelta(act7, actPrev7),
      activity7: act7,
      newDeals7: deals.filter(d => idx.get(dayKey(d.created_at))! >= DAYS - 7).length,
      revenue7: revenueByDay.slice(DAYS - 7).reduce((a, b) => a + b, 0),
    },
    leaderboard,
    feed,
  }
}

// ---- Distinct facets (for filter dropdowns) ---------------------------------

export function getFacets() {
  const db = getDb()
  const col = (c: string) => (db.prepare(`SELECT DISTINCT ${c} v FROM influencers WHERE ${c} IS NOT NULL AND ${c} != '' ORDER BY ${c}`).all() as { v: string }[]).map(r => r.v)
  return { niche: col('niche'), tier: col('quality_tier'), market: col('market'), account_type: col('account_type') }
}
