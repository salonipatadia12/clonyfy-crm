/**
 * Populate realistic CRM activity on top of the scraped data so the pipeline,
 * deals, and revenue views have something to show.
 *
 *   npm run demo
 *
 * Resets CRM state (stages/notes/deals) then walks a spread of high-value
 * creators through the funnel and logs deals — some won, some in flight.
 * Re-run any time; the underlying scraped facts are untouched.
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

const db = new DatabaseSync(path.join(process.cwd(), 'data', 'clonify.db'))
const now = () => new Date().toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString()

// Clean slate for CRM state (keeps scraped influencer rows).
db.exec('BEGIN')
db.exec("UPDATE influencers SET stage = 'Prospecting'")
db.exec('DELETE FROM pipeline_entries')
db.exec('DELETE FROM notes')
db.exec('DELETE FROM collaborations')
db.exec('COMMIT')

// Best creators first — these are the ones an operator would actually work.
const pool = db.prepare(
  `SELECT id, name FROM influencers
   WHERE quality_tier IN ('A','B') AND engagement_rate > 0
   ORDER BY (quality_tier='A') DESC, engagement_rate DESC
   LIMIT 90`
).all() as { id: string; name: string }[]

// How many creators land in each non-default stage.
const plan: { stage: string; n: number }[] = [
  { stage: 'Contacted', n: 22 },
  { stage: 'Responded', n: 14 },
  { stage: 'Negotiating', n: 9 },
  { stage: 'Deal Closed', n: 7 },
  { stage: 'Live', n: 5 },
  { stage: 'Completed', n: 6 },
]

const setStage = db.prepare('UPDATE influencers SET stage = ?, updated_at = ? WHERE id = ?')
const addEntry = db.prepare('INSERT INTO pipeline_entries (influencer_id, from_stage, to_stage, note, changed_at) VALUES (?,?,?,?,?)')
const addNote = db.prepare('INSERT INTO notes (influencer_id, content, created_at) VALUES (?,?,?)')
const addDeal = db.prepare(
  `INSERT INTO collaborations (influencer_id, title, status, deal_value, currency, deliverables, notes, created_at)
   VALUES (?,?,?,?,?,?,?,?)`
)

const ORDER = ['Prospecting', 'Contacted', 'Responded', 'Negotiating', 'Deal Closed', 'Live', 'Completed']
const titles = ['Sponsored Reel', 'Product Launch Collab', 'Story Takeover', '3-Post Package', 'Brand Ambassador Q3', 'UGC Bundle', 'Giveaway Partnership']
const values = [800, 1200, 1500, 2200, 3000, 4500, 6000, 8500]

let idx = 0
let dealCount = 0
let revenue = 0

db.exec('BEGIN')
for (const { stage, n } of plan) {
  for (let i = 0; i < n && idx < pool.length; i++, idx++) {
    const c = pool[idx]
    const stageIdx = ORDER.indexOf(stage)
    // Spread each creator's journey across the last ~28 days so the momentum
    // chart fills the whole range instead of bunching on today.
    const baseDay = 4 + ((idx * 13) % 24) // 4..27 days ago
    // Recently-touched: a creator you just moved should surface on the board.
    setStage.run(stage, now(), c.id)
    // record each hop so the activity timeline reads naturally
    for (let s = 1; s <= stageIdx; s++) {
      addEntry.run(c.id, ORDER[s - 1], ORDER[s], null, daysAgo(Math.max(0, baseDay - (stageIdx - s))))
    }
    if (stage === 'Contacted' && i % 3 === 0) {
      addNote.run(c.id, 'Sent intro DM — referenced their latest reel.', daysAgo(Math.max(0, baseDay - 1)))
    }
    // Deals appear once a creator is Negotiating or further along.
    if (stageIdx >= ORDER.indexOf('Negotiating')) {
      const value = values[(idx + stageIdx) % values.length]
      // Completed/Live = revenue won; otherwise still active.
      const status = stage === 'Completed' || stage === 'Live' ? 'completed' : 'active'
      addDeal.run(
        c.id,
        titles[idx % titles.length],
        status,
        value,
        'USD',
        JSON.stringify(['1 Reel', '2 Stories']),
        null,
        daysAgo(Math.max(0, baseDay - 1)),
      )
      dealCount++
      if (status === 'completed') revenue += value
    }
  }
}
db.exec('COMMIT')

const stages = db.prepare('SELECT stage, COUNT(*) n FROM influencers GROUP BY stage').all()
console.log(`✓ Demo CRM activity seeded — ${dealCount} deals, $${revenue.toLocaleString()} revenue won`)
console.table(stages)
db.close()
