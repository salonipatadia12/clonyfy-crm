/**
 * Seed the local SQLite store from the scraper output.
 *
 *   npm run seed
 *
 * Loads ../output/instagram_outreach.csv (or the bundled seed-data/ fallback)
 * into data/clonify.db. Upserts by handle so scraped facts refresh while CRM
 * state (stage, notes, deals) is preserved across runs.
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { SCHEMA } from '../lib/db/schema'
import { locateSeedDir, seedInfluencers } from '../lib/db/seeder'

const dir = locateSeedDir()
if (!dir) {
  console.error('✗ No seed data found (looked in ../output and ./seed-data).')
  process.exit(1)
}

const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(path.join(dataDir, 'clonify.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec(SCHEMA)

const n = seedInfluencers(db, dir)
const count = (db.prepare('SELECT COUNT(*) n FROM influencers').get() as { n: number }).n
const tiers = db.prepare('SELECT quality_tier, COUNT(*) n FROM influencers GROUP BY quality_tier').all()
console.log(`✓ Seeded ${n} rows from ${dir} — ${count} influencers in DB`)
console.table(tiers)
db.close()
