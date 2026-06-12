import type { DatabaseSync } from 'node:sqlite'
import Papa from 'papaparse'
import path from 'node:path'
import fs from 'node:fs'

// Shared seeding logic used by the CLI scripts (scripts/seed.ts, scripts/demo.ts)
// and at runtime (lib/db getDb auto-seeds an empty DB — needed on serverless
// hosts where the committed DB doesn't exist and the FS is ephemeral).

type Row = Record<string, string>
const MIN_FOLLOWERS = 1000

function toInt(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = parseInt(String(v).replace(/[, ]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}
function toFloat(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
const yes = (v: string | undefined) => (String(v).toLowerCase() === 'yes' || v === '1' ? 1 : 0)
const tierToPriority = (t: string | undefined) => (t === 'A' ? 'high' : t === 'B' ? 'medium' : 'low')

// Prefer the live scraper output (sibling ../output); otherwise the CSVs
// bundled in this repo (seed-data/) so the app runs without the scraper.
export function locateSeedDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'output'),
    path.join(process.cwd(), 'seed-data'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'instagram_outreach.csv'))) return dir
  }
  return null
}

export function seedInfluencers(db: DatabaseSync, dir: string): number {
  const csvPath = path.join(dir, 'instagram_outreach.csv')
  const jsonlPath = path.join(dir, 'instagram_profiles.jsonl')

  const extra = new Map<string, { following: number | null; posts: number | null; priv: number }>()
  if (fs.existsSync(jsonlPath)) {
    for (const line of fs.readFileSync(jsonlPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const d = JSON.parse(line)
        if (d.handle) extra.set(String(d.handle).toLowerCase(), {
          following: toInt(d.following_count), posts: toInt(d.posts_count), priv: yes(d.is_private),
        })
      } catch { /* skip malformed line */ }
    }
  }

  const parsed = Papa.parse<Row>(fs.readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true })
  const rows = parsed.data.filter(r =>
    r.handle && yes(r.is_brand_noise) !== 1 && (toInt(r.follower_count) ?? 0) >= MIN_FOLLOWERS
  )

  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO influencers (
      id, handle, name, follower_count, following_count, posts_count, engagement_rate,
      avg_likes, eng_quality, account_type, category, niche, market, country_seed,
      is_verified, is_private, quality_tier, bio_link, biography, email, profile_url,
      avatar_url, stage, priority, scraped_at, created_at, updated_at
    ) VALUES (
      @id, @handle, @name, @follower_count, @following_count, @posts_count, @engagement_rate,
      @avg_likes, @eng_quality, @account_type, @category, @niche, @market, @country_seed,
      @is_verified, @is_private, @quality_tier, @bio_link, @biography, @email, @profile_url,
      @avatar_url, @stage, @priority, @scraped_at, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      handle=excluded.handle, name=excluded.name, follower_count=excluded.follower_count,
      following_count=excluded.following_count, posts_count=excluded.posts_count,
      engagement_rate=excluded.engagement_rate, avg_likes=excluded.avg_likes,
      eng_quality=excluded.eng_quality, account_type=excluded.account_type,
      category=excluded.category, niche=excluded.niche, market=excluded.market,
      country_seed=excluded.country_seed, is_verified=excluded.is_verified,
      is_private=excluded.is_private, quality_tier=excluded.quality_tier,
      bio_link=excluded.bio_link, biography=excluded.biography,
      email=COALESCE(NULLIF(excluded.email,''), influencers.email),
      profile_url=excluded.profile_url, scraped_at=excluded.scraped_at
  `)

  db.exec('BEGIN')
  for (const r of rows) {
    const handle = r.handle.trim().toLowerCase()
    const ex = extra.get(handle)
    stmt.run({
      id: handle,
      handle,
      name: (r.full_name && r.full_name.trim()) || handle,
      follower_count: toInt(r.follower_count),
      following_count: ex?.following ?? null,
      posts_count: ex?.posts ?? null,
      engagement_rate: toFloat(r.engagement_rate),
      avg_likes: toInt(r.avg_likes),
      eng_quality: r.eng_quality || null,
      account_type: r.account_type || null,
      category: r.category || null,
      niche: r.niche || null,
      market: r.market || null,
      country_seed: r.country_seed || null,
      is_verified: yes(r.is_verified),
      is_private: ex?.priv ?? 0,
      quality_tier: r.quality_tier || null,
      bio_link: r.bio_link || null,
      biography: r.biography || null,
      email: r.business_email || null,
      profile_url: r.profile_url || `https://www.instagram.com/${handle}/`,
      avatar_url: null,
      stage: 'Prospecting',
      priority: tierToPriority(r.quality_tier),
      scraped_at: r.scraped_at || now,
      created_at: now,
      updated_at: now,
    })
  }
  db.exec('COMMIT')
  return rows.length
}

const ORDER = ['Prospecting', 'Contacted', 'Responded', 'Negotiating', 'Deal Closed', 'Live', 'Completed']
const TITLES = ['Sponsored Reel', 'Product Launch Collab', 'Story Takeover', '3-Post Package', 'Brand Ambassador Q3', 'UGC Bundle', 'Giveaway Partnership']
const VALUES = [800, 1200, 1500, 2200, 3000, 4500, 6000, 8500]
const PLAN = [
  { stage: 'Contacted', n: 22 }, { stage: 'Responded', n: 14 }, { stage: 'Negotiating', n: 9 },
  { stage: 'Deal Closed', n: 7 }, { stage: 'Live', n: 5 }, { stage: 'Completed', n: 6 },
]

// Reset CRM state, then walk a spread of creators through the funnel and log
// deals (some won, some active), spread across ~28 days for a lively chart.
export function seedDemo(db: DatabaseSync): { deals: number; revenue: number } {
  const now = () => new Date().toISOString()
  const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString()

  db.exec('BEGIN')
  db.exec("UPDATE influencers SET stage = 'Prospecting'")
  db.exec('DELETE FROM pipeline_entries')
  db.exec('DELETE FROM notes')
  db.exec('DELETE FROM collaborations')
  db.exec('COMMIT')

  const pool = db.prepare(
    `SELECT id, name FROM influencers
     WHERE quality_tier IN ('A','B') AND engagement_rate > 0
     ORDER BY (quality_tier='A') DESC, engagement_rate DESC LIMIT 90`
  ).all() as { id: string; name: string }[]

  const setStage = db.prepare('UPDATE influencers SET stage = ?, updated_at = ? WHERE id = ?')
  const addEntry = db.prepare('INSERT INTO pipeline_entries (influencer_id, from_stage, to_stage, note, changed_at) VALUES (?,?,?,?,?)')
  const addNote = db.prepare('INSERT INTO notes (influencer_id, content, created_at) VALUES (?,?,?)')
  const addDeal = db.prepare(
    `INSERT INTO collaborations (influencer_id, title, status, deal_value, currency, deliverables, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  )

  let idx = 0, deals = 0, revenue = 0
  db.exec('BEGIN')
  for (const { stage, n } of PLAN) {
    for (let i = 0; i < n && idx < pool.length; i++, idx++) {
      const c = pool[idx]
      const stageIdx = ORDER.indexOf(stage)
      const baseDay = 4 + ((idx * 13) % 24)
      setStage.run(stage, now(), c.id)
      for (let s = 1; s <= stageIdx; s++) {
        addEntry.run(c.id, ORDER[s - 1], ORDER[s], null, daysAgo(Math.max(0, baseDay - (stageIdx - s))))
      }
      if (stage === 'Contacted' && i % 3 === 0) {
        addNote.run(c.id, 'Sent intro DM — referenced their latest reel.', daysAgo(Math.max(0, baseDay - 1)))
      }
      if (stageIdx >= ORDER.indexOf('Negotiating')) {
        const value = VALUES[(idx + stageIdx) % VALUES.length]
        const status = stage === 'Completed' || stage === 'Live' ? 'completed' : 'active'
        addDeal.run(c.id, TITLES[idx % TITLES.length], status, value, 'USD', JSON.stringify(['1 Reel', '2 Stories']), null, daysAgo(Math.max(0, baseDay - 1)))
        deals++
        if (status === 'completed') revenue += value
      }
    }
  }
  db.exec('COMMIT')
  return { deals, revenue }
}

// Runtime auto-seed: if the DB has no influencers, load them + demo activity.
export function ensureSeeded(db: DatabaseSync): void {
  const count = (db.prepare('SELECT COUNT(*) n FROM influencers').get() as { n: number }).n
  if (count > 0) return
  const dir = locateSeedDir()
  if (!dir) return
  seedInfluencers(db, dir)
  seedDemo(db)
}
