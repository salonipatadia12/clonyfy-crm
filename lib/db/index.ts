import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { SCHEMA } from './schema'
import { ensureSeeded } from './seeder'

// ---- Connection singleton ---------------------------------------------------

let _db: DatabaseSync | null = null

// On serverless hosts (e.g. Vercel) the project dir is read-only; only the
// system temp dir is writable. Locally we keep the DB in ./data.
function dataDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'clonify')
  }
  return path.join(process.cwd(), 'data')
}

function migrate(db: DatabaseSync) {
  // Add columns introduced after a DB may already exist (idempotent).
  const cols = (table: string) =>
    new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name))
  const inf = cols('influencers')
  if (!inf.has('in_pipeline')) db.exec('ALTER TABLE influencers ADD COLUMN in_pipeline INTEGER NOT NULL DEFAULT 0')
  if (!inf.has('added_via')) db.exec('ALTER TABLE influencers ADD COLUMN added_via TEXT')
  const col = cols('collaborations')
  if (!col.has('reel_url')) db.exec('ALTER TABLE collaborations ADD COLUMN reel_url TEXT')
  if (!col.has('reel_views')) db.exec('ALTER TABLE collaborations ADD COLUMN reel_views INTEGER')
}

export function getDb(): DatabaseSync {
  if (_db) return _db
  const dir = dataDir()
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, 'clonify.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  migrate(db)
  // Auto-seed when empty (fresh serverless instance with no committed DB).
  ensureSeeded(db)
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
  in_pipeline: number
  stage: string
  priority: string
  added_via: string | null
  scraped_at: string | null
  created_at: string
  updated_at: string
}

export interface ListParams {
  search?: string
  niche?: string[]
  stage?: string[]
  market?: string[]
  accountType?: string[]
  verifiedOnly?: boolean
  minFollowers?: number
  maxFollowers?: number
  inPipeline?: boolean      // only creators added to the pipeline
  notInPipeline?: boolean   // only discovery-pool creators not yet in pipeline
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const SORTABLE = new Set([
  'follower_count', 'name', 'handle', 'market', 'stage', 'updated_at', 'created_at',
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
  inFilter('stage', p.stage)
  inFilter('market', p.market)
  inFilter('account_type', p.accountType)
  if (p.verifiedOnly) conds.push('is_verified = 1')
  if (p.inPipeline) conds.push('in_pipeline = 1')
  if (p.notInPipeline) conds.push('in_pipeline = 0')
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

// ---- Activity log -----------------------------------------------------------

export function logActivity(kind: string, influencerId: string | null, detail?: string | null, value?: number | null) {
  getDb().prepare('INSERT INTO activity_log (kind, influencer_id, detail, value, created_at) VALUES (?,?,?,?,?)')
    .run(kind, influencerId, detail ?? null, value ?? null, new Date().toISOString())
}

export function listActivity(limit = 12) {
  return getDb().prepare(`
    SELECT a.kind, a.detail, a.value, a.created_at AS ts, i.name, i.handle
    FROM activity_log a LEFT JOIN influencers i ON i.id = a.influencer_id
    ORDER BY a.created_at DESC LIMIT ?`).all(limit)
}

// ---- Pipeline membership ----------------------------------------------------

export function addToPipeline(ids: string[]): number {
  const db = getDb()
  const now = new Date().toISOString()
  const upd = db.prepare("UPDATE influencers SET in_pipeline = 1, updated_at = ? WHERE id = ? AND in_pipeline = 0")
  let added = 0
  db.exec('BEGIN')
  try {
    for (const id of ids) {
      const res = upd.run(now, id)
      if (res.changes) {
        added++
        const inf = getInfluencer(id)
        logActivity('added', id, inf?.name ?? id)
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return added
}

export function moveStage(id: string, toStage: string, note?: string) {
  const db = getDb()
  const cur = getInfluencer(id)
  if (!cur) throw new Error('influencer not found')
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    // Moving stage implies the creator is in the pipeline.
    db.prepare('UPDATE influencers SET stage = ?, in_pipeline = 1, updated_at = ? WHERE id = ?').run(toStage, now, id)
    db.prepare('INSERT INTO pipeline_entries (influencer_id, from_stage, to_stage, note, changed_at) VALUES (?,?,?,?,?)')
      .run(id, cur.stage, toStage, note ?? null, now)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  logActivity('stage', id, toStage)
  return getInfluencer(id)
}

// ---- Add creator by Instagram URL ------------------------------------------

const tierToPriority = (t: string | null | undefined) => (t === 'A' ? 'high' : t === 'B' ? 'medium' : 'low')

export function addInfluencerByUrl(input: { handle: string; name?: string | null; profile_url?: string | null; follower_count?: number | null; biography?: string | null; niche?: string | null; addToPipeline?: boolean }) {
  const db = getDb()
  const handle = input.handle.trim().toLowerCase().replace(/^@/, '')
  if (!handle) throw new Error('handle required')
  const now = new Date().toISOString()
  const existing = getInfluencer(handle)
  if (existing) {
    if (input.addToPipeline) addToPipeline([handle])
    return { influencer: getInfluencer(handle), created: false }
  }
  db.prepare(`
    INSERT INTO influencers (id, handle, name, follower_count, biography, niche, profile_url,
      is_verified, is_private, in_pipeline, stage, priority, added_via, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,0,0,?,?,?,'url',?,?)
  `).run(
    handle, handle, (input.name?.trim() || handle), input.follower_count ?? null, input.biography ?? null,
    input.niche ?? null, input.profile_url ?? `https://www.instagram.com/${handle}/`,
    input.addToPipeline ? 1 : 0, 'Prospecting', tierToPriority(null), now, now,
  )
  if (input.addToPipeline) logActivity('added', handle, input.name?.trim() || handle)
  return { influencer: getInfluencer(handle), created: true }
}

// ---- Notes ------------------------------------------------------------------

export function listNotes(influencerId: string) {
  return getDb().prepare('SELECT * FROM notes WHERE influencer_id = ? ORDER BY created_at DESC').all(influencerId)
}
export function addNote(influencerId: string, content: string) {
  const now = new Date().toISOString()
  const info = getDb().prepare('INSERT INTO notes (influencer_id, content, created_at) VALUES (?,?,?)').run(influencerId, content, now)
  logActivity('note', influencerId, content.slice(0, 80))
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
  reel_url?: string | null
  reel_views?: number | null
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
  const db = getDb()
  const now = new Date().toISOString()
  const status = d.status ?? 'active'
  const info = db.prepare(
    `INSERT INTO collaborations (influencer_id, title, status, deal_value, currency, start_date, end_date, deliverables, reel_url, reel_views, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    d.influencer_id, d.title, status, d.deal_value ?? null, d.currency ?? 'USD',
    d.start_date ?? null, d.end_date ?? null, JSON.stringify(d.deliverables ?? []),
    d.reel_url ?? null, d.reel_views ?? null, d.notes ?? null, now,
  )
  const inf = getInfluencer(d.influencer_id)
  logActivity(status === 'completed' ? 'closed' : 'deal', d.influencer_id, d.title, d.deal_value ?? null)
  void inf
  return db.prepare('SELECT * FROM collaborations WHERE id = ?').get(info.lastInsertRowid)
}

export function updateDeal(id: number, patch: Record<string, unknown>) {
  const db = getDb()
  const allowed = ['title', 'status', 'deal_value', 'currency', 'start_date', 'end_date', 'reel_url', 'reel_views', 'notes']
  const before = db.prepare('SELECT * FROM collaborations WHERE id = ?').get(id) as any
  const keys = Object.keys(patch).filter(k => allowed.includes(k))
  if (keys.length) {
    db.prepare(`UPDATE collaborations SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...(keys.map(k => patch[k]) as (string | number | null)[]), id)
  }
  const after = db.prepare('SELECT * FROM collaborations WHERE id = ?').get(id) as any
  // Log when a deal transitions into 'completed' (revenue won).
  if (after && before && before.status !== 'completed' && after.status === 'completed') {
    logActivity('closed', after.influencer_id, after.title, after.deal_value ?? null)
  }
  return after
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

// Close Rate = (Deal Closed + Live) / (Contacted + Responded + Negotiating + Deal Closed + Live)
const CLOSE_NUM = ['Deal Closed', 'Live']
const CLOSE_DEN = ['Contacted', 'Responded', 'Negotiating', 'Deal Closed', 'Live']

export function getStats() {
  const db = getDb()
  const totals = db.prepare(`
    SELECT COUNT(*) total,
           COALESCE(SUM(follower_count),0) reach
    FROM influencers`).get() as { total: number; reach: number }

  // Pipeline funnel counts only creators actually added to the pipeline.
  const byStage = db.prepare("SELECT stage, COUNT(*) count, COALESCE(SUM(follower_count),0) reach FROM influencers WHERE in_pipeline = 1 GROUP BY stage").all() as { stage: string; count: number; reach: number }[]
  const byNiche = db.prepare("SELECT niche, COUNT(*) count, COALESCE(SUM(follower_count),0) reach FROM influencers WHERE niche IS NOT NULL AND niche != '' GROUP BY niche ORDER BY count DESC").all() as { niche: string; count: number; reach: number }[]

  const stageCount = (stages: string[]) => byStage.filter(s => stages.includes(s.stage)).reduce((a, s) => a + s.count, 0)
  const closeNum = stageCount(CLOSE_NUM)
  const closeDen = stageCount(CLOSE_DEN)
  const closeRate = closeDen ? (closeNum / closeDen) * 100 : 0

  const deals = db.prepare(`
    SELECT COUNT(*) deal_count,
           COALESCE(SUM(deal_value),0) total_value,
           COALESCE(SUM(CASE WHEN status='completed' THEN deal_value ELSE 0 END),0) revenue_won,
           COALESCE(SUM(CASE WHEN status='active' THEN deal_value ELSE 0 END),0) pipeline_value,
           COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) active_count,
           COALESCE(SUM(CASE WHEN reel_url IS NOT NULL AND reel_url != '' THEN 1 ELSE 0 END),0) videos
    FROM collaborations`).get() as { deal_count: number; total_value: number; revenue_won: number; pipeline_value: number; active_count: number; videos: number }

  return {
    totals: {
      total: totals.total,
      reach: totals.reach,
      inPipeline: byStage.reduce((a, s) => a + s.count, 0),
      activeDeals: deals.active_count,
      videos: deals.videos,
    },
    closeRate,
    byStage, byNiche, deals,
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

  // Top Partners: highest-value commercial relationships (must have a deal value).
  const leaderboard = db.prepare(`
    SELECT i.id, i.handle, i.name, i.follower_count, i.stage,
           COALESCE(SUM(c.deal_value),0) deal_total
    FROM influencers i JOIN collaborations c ON c.influencer_id = i.id
    WHERE c.deal_value IS NOT NULL AND c.deal_value > 0
    GROUP BY i.id ORDER BY deal_total DESC LIMIT 6
  `).all()

  // Live activity feed — real in-app actions from the activity log.
  const feed = listActivity(12)

  return {
    ...base,
    series,
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

// Monthly revenue-won series for the Analytics page.
export function getRevenueByMonth(months = 6) {
  const db = getDb()
  const today = new Date()
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    keys.push(d.toISOString().slice(0, 7))
  }
  const idx = new Map(keys.map((k, i) => [k, i]))
  const out = keys.map(k => ({ month: k, revenue: 0, deals: 0 }))
  const rows = db.prepare("SELECT created_at, deal_value FROM collaborations WHERE status='completed'").all() as { created_at: string; deal_value: number | null }[]
  for (const r of rows) {
    const i = idx.get(r.created_at.slice(0, 7))
    if (i != null) { out[i].revenue += r.deal_value || 0; out[i].deals += 1 }
  }
  return out
}

// Top deals by value for the Analytics page.
export function getTopDeals(limit = 6) {
  return getDb().prepare(`
    SELECT c.id, c.title, c.deal_value, c.status, c.reel_views, i.name influencer_name, i.handle influencer_handle
    FROM collaborations c JOIN influencers i ON i.id = c.influencer_id
    WHERE c.deal_value IS NOT NULL AND c.deal_value > 0
    ORDER BY c.deal_value DESC LIMIT ?`).all(limit)
}

// ---- Distinct facets (for filter dropdowns) ---------------------------------

export function getFacets() {
  const db = getDb()
  const col = (c: string) => (db.prepare(`SELECT DISTINCT ${c} v FROM influencers WHERE ${c} IS NOT NULL AND ${c} != '' ORDER BY ${c}`).all() as { v: string }[]).map(r => r.v)
  const total = (db.prepare('SELECT COUNT(*) n FROM influencers').get() as { n: number }).n
  return { niche: col('niche'), market: col('market'), account_type: col('account_type'), total }
}
