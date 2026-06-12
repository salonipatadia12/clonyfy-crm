/**
 * Populate realistic CRM activity (pipeline + deals) on top of the scraped data
 * so the dashboard, pipeline, and deal views have something to show.
 *
 *   npm run demo
 *
 * Resets CRM state then walks a spread of high-value creators through the
 * funnel and logs deals (some won, some in flight). Scraped facts are untouched.
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { SCHEMA } from '../lib/db/schema'
import { seedDemo } from '../lib/db/seeder'

const db = new DatabaseSync(path.join(process.cwd(), 'data', 'clonify.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec(SCHEMA)

const { deals, revenue } = seedDemo(db)
const stages = db.prepare('SELECT stage, COUNT(*) n FROM influencers GROUP BY stage').all()
console.log(`✓ Demo CRM activity seeded — ${deals} deals, $${revenue.toLocaleString()} revenue won`)
console.table(stages)
db.close()
