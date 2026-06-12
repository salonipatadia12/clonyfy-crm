/**
 * Seed the local SQLite store from the scraper output.
 *
 *   npm run seed
 *
 * Reads ../output/instagram_outreach.csv (curated, tiered 3.2k) and enriches
 * each row with following/posts/private flags from instagram_profiles.jsonl.
 * Upserts by handle: scraped facts are refreshed, CRM state (stage, priority,
 * notes, deals) is preserved across runs.
 */
import { DatabaseSync } from 'node:sqlite'
import Papa from 'papaparse'
import path from 'node:path'
import fs from 'node:fs'
import { SCHEMA } from '../lib/db/schema'

const ROOT = process.cwd()
// Prefer the live scraper output (sibling ../output); fall back to the
// CSVs bundled in this repo so a fresh clone is runnable out of the box.
const SCRAPER_DIR = path.resolve(ROOT, '..', 'output')
const BUNDLED_DIR = path.join(ROOT, 'seed-data')
const OUTPUT_DIR = fs.existsSync(path.join(SCRAPER_DIR, 'instagram_outreach.csv')) ? SCRAPER_DIR : BUNDLED_DIR
const CSV = path.join(OUTPUT_DIR, 'instagram_outreach.csv')
const JSONL = path.join(OUTPUT_DIR, 'instagram_profiles.jsonl')

type Row = Record<string, string>

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
const tierToPriority = (t: string | undefined) =>
  t === 'A' ? 'high' : t === 'B' ? 'medium' : 'low'

function main() {
  if (!fs.existsSync(CSV)) {
    console.error(`✗ Cannot find ${CSV}. Run the scraper first.`)
    process.exit(1)
  }

  // ---- extra fields from JSONL keyed by handle ----
  const extra = new Map<string, { following: number | null; posts: number | null; priv: number }>()
  if (fs.existsSync(JSONL)) {
    for (const line of fs.readFileSync(JSONL, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const d = JSON.parse(line)
        if (d.handle) extra.set(String(d.handle).toLowerCase(), {
          following: toInt(d.following_count), posts: toInt(d.posts_count), priv: yes(d.is_private),
        })
      } catch { /* skip malformed line */ }
    }
  }

  const MIN_FOLLOWERS = 1000
  const csv = fs.readFileSync(CSV, 'utf8')
  const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true })
  const rows = parsed.data.filter(r =>
    r.handle &&
    yes(r.is_brand_noise) !== 1 &&
    (toInt(r.follower_count) ?? 0) >= MIN_FOLLOWERS
  )

  const dataDir = path.join(ROOT, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(dataDir, 'clonify.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)

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

  const insertMany = (items: Row[]) => {
    db.exec('BEGIN')
    for (const r of items) {
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
  }

  insertMany(rows)

  const count = (db.prepare('SELECT COUNT(*) n FROM influencers').get() as { n: number }).n
  const tiers = db.prepare('SELECT quality_tier, COUNT(*) n FROM influencers GROUP BY quality_tier').all()
  console.log(`✓ Seeded ${rows.length} rows from CSV — ${count} influencers in DB`)
  console.table(tiers)
  db.close()
}

main()
