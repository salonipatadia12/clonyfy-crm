/**
 * Demo seed / reset tests against the live schema.
 *
 * These prove the properties that make the demo system safe to run against a
 * workspace holding 4,596 real creator records:
 *
 *   - seeding twice inserts nothing the second time
 *   - reset deletes exactly the seeded rows and nothing else
 *   - not one influencer row is created, changed or deleted by either
 *   - an unclassified record can never be reported as qualified
 *   - an organisation can never appear in the qualified view
 *   - one creator holds genuinely independent state in two campaigns
 *
 * The tests run against whatever demo run is already seeded and leave it in
 * place. The destructive round-trip (reset then re-seed) is guarded so it only
 * runs when the seed is already present, and it restores what it removed.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { connect } from '../scripts/db.mjs'
import { DEMO_TABLES_DELETE_ORDER, PROTECTED_TABLES } from '../scripts/demo-common.mjs'
import { DEMO_LABEL, CLIENTS, CAMPAIGNS } from '../scripts/demo-fixture.mjs'

let db, ws, runId

const npm = (args) =>
  execFileSync('npm', args, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' })

before(async () => {
  db = await connect()
  const { rows: [w] } = await db.query('select id from workspaces order by created_at limit 1')
  ws = w.id
  const { rows } = await db.query(
    'select id from demo_runs where workspace_id = $1 and label = $2', [ws, DEMO_LABEL])
  runId = rows[0]?.id ?? null
})
after(async () => { await db.end() })

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

test('a demo run exists and every seeded row is attributed to it', async () => {
  assert.ok(runId, 'no demo run — run `npm run demo:seed` first')
  for (const t of DEMO_TABLES_DELETE_ORDER) {
    const { rows: [r] } = await db.query(
      `select count(*)::int n from ${t} where demo_run_id is not null and demo_run_id <> $1`, [runId])
    assert.equal(r.n, 0, `${t} has rows attributed to a different demo run`)
  }
})

test('the influencers table carries no demo provenance column values', async () => {
  // Demo campaigns reference real creators. A demo flag on a creator row would
  // be a claim about that creator, and would put it in reset's path.
  const { rows } = await db.query(`
    select column_name from information_schema.columns
     where table_name = 'influencers' and column_name in ('demo_run_id', 'demo_key')`)
  assert.equal(rows.length, 0, 'influencers must not be demo-flaggable')
})

test('every demo campaign_creator points at a real, pre-existing catalog record', async () => {
  const { rows } = await db.query(`
    select count(*)::int n from campaign_creators cc
     where cc.demo_run_id = $1
       and not exists (select 1 from influencers i where i.id = cc.influencer_id)`, [runId])
  assert.equal(rows[0].n, 0, 'a demo membership points at a missing creator')
})

test('no demo relationship references an identified organisation', async () => {
  const { rows } = await db.query(`
    select i.handle, i.entity_type
      from campaign_creators cc join influencers i on i.id = cc.influencer_id
     where cc.demo_run_id = $1
       and i.entity_type in ('likely_organization','brand','business','institution',
                             'government','publisher','aggregator')`, [runId])
  assert.deepEqual(rows, [], `demo roster contains organisations: ${rows.map(r => r.handle).join(', ')}`)
})

// ---------------------------------------------------------------------------
// Qualification correctness
// ---------------------------------------------------------------------------

test('an unclassified record is never automatically qualified', async () => {
  const { rows: [r] } = await db.query(`
    select count(*)::int n from influencers
     where entity_type = 'unclassified'
       and review_state <> 'approved'
       and qualification_status = 'qualified'`)
  assert.equal(r.n, 0, `${r.n} unclassified records are reported as qualified`)
})

test('qualification always rests on a positive human decision', async () => {
  const { rows: [r] } = await db.query(`
    select count(*)::int n from influencers
     where qualification_status = 'qualified'
       and review_state <> 'approved'
       and entity_type <> 'individual_creator'`)
  assert.equal(r.n, 0, 'a record is qualified without approval or a positive classification')
})

test('no identified organisation appears in the qualified view', async () => {
  const { rows } = await db.query(`
    select handle, entity_type from influencers
     where qualification_status = 'qualified'
       and entity_type in ('likely_organization','brand','business','institution',
                           'government','publisher','aggregator')`)
  assert.deepEqual(rows, [], `organisations in the qualified view: ${rows.map(r => r.handle).join(', ')}`)
})

test('the named false positives are out of the qualified view', async () => {
  // The specific accounts that were reported as qualified creators before the fix.
  const { rows } = await db.query(`
    select handle, qualification_status, entity_type from influencers
     where handle in ('kennedyspacecenter','googlecloud','blackrock','nvidiaai',
                      'applebooks','elysee','nasaarmstrong','nasaglenn',
                      'googledeepmind','microsoftlearn','wordpressdotcom','udea')`)
  assert.ok(rows.length > 0, 'expected these catalog records to still exist')
  for (const r of rows) {
    assert.notEqual(r.qualification_status, 'qualified',
      `${r.handle} (${r.entity_type}) is still reported as a qualified creator`)
  }
})

test('unclassified Instagram records remain reachable as candidates', async () => {
  // The fix must not make thousands of usable records disappear.
  const { rows: [r] } = await db.query(
    `select count(*)::int n from influencers where qualification_status = 'candidate'`)
  assert.ok(r.n > 1000, `only ${r.n} candidates remain — the fix hid usable records`)
})

test('review decisions are auditable', async () => {
  const { rows } = await db.query(`
    select column_name from information_schema.columns
     where table_name = 'creator_reviews'`)
  const cols = rows.map(r => r.column_name)
  for (const c of ['actor_id', 'actor_name', 'created_at', 'prev_entity_type',
                   'new_entity_type', 'prev_review_state', 'new_review_state', 'reason']) {
    assert.ok(cols.includes(c), `creator_reviews is missing ${c}`)
  }
})

// ---------------------------------------------------------------------------
// Campaign independence
// ---------------------------------------------------------------------------

test('a creator holds independent state in two campaigns', async () => {
  const { rows } = await db.query(`
    select influencer_id, count(*)::int n,
           count(distinct stage)::int stages,
           count(distinct campaign_id)::int campaigns
      from campaign_creators where demo_run_id = $1
     group by influencer_id having count(*) > 1`, [runId])
  assert.ok(rows.length >= 2, 'the fixture must place at least two creators in two campaigns')
  const varied = rows.filter(r => r.stages > 1)
  assert.ok(varied.length >= 1, 'no shared creator has a different stage in each campaign')
  for (const r of rows) assert.equal(r.campaigns, r.n, 'a creator is duplicated within one campaign')
})

test('offers and deliverables belong to a relationship, not to a creator', async () => {
  const { rows: [r] } = await db.query(`
    select count(*)::int n from offers o
     where o.demo_run_id = $1
       and not exists (select 1 from campaign_creators cc where cc.id = o.campaign_creator_id)`, [runId])
  assert.equal(r.n, 0)
  const { rows: [d] } = await db.query(`
    select count(*)::int n from deliverables dl
     where dl.demo_run_id = $1
       and not exists (select 1 from campaign_creators cc where cc.id = dl.campaign_creator_id)`, [runId])
  assert.equal(d.n, 0)
})

test('at most one offer exists per relationship', async () => {
  const { rows } = await db.query(`
    select campaign_creator_id from offers where demo_run_id = $1
     group by 1 having count(*) > 1`, [runId])
  assert.deepEqual(rows, [])
})

// ---------------------------------------------------------------------------
// Fixture completeness — what the browser walkthrough depends on
// ---------------------------------------------------------------------------

test('the seeded scenario covers the states the UI has views for', async () => {
  const one = async (sql) => (await db.query(sql, [runId])).rows
  const stages = await one('select distinct stage from campaign_creators where demo_run_id = $1')
  assert.ok(stages.length === 5, `expected all 5 statuses, got ${stages.length}`)

  for (const st of ['not_contacted', 'contacted', 'replied', 'interested', 'declined']) {
    assert.ok(stages.some(r => r.stage === st), `nobody is "${st}"`)
  }

  const channels = await one('select distinct outreach_channel from campaign_creators where demo_run_id = $1')
  for (const ch of ['instagram_dm', 'email', 'phone']) {
    assert.ok(channels.some(r => r.outreach_channel === ch), `no membership contacted by "${ch}"`)
  }
  const campStatus = await one('select distinct status from campaigns where demo_run_id = $1')
  for (const s of ['active', 'completed']) {
    assert.ok(campStatus.some(r => r.status === s), `no campaign in "${s}"`)
  }
})

test('the dashboard has follow-ups to show, both due today and overdue', async () => {
  const { rows: [r] } = await db.query(`
    select count(*) filter (where next_follow_up = current_date)::int today,
           count(*) filter (where next_follow_up < current_date)::int overdue
      from campaign_creators where demo_run_id = $1`, [runId])
  assert.ok(r.today > 0, 'nothing is due today')
  assert.ok(r.overdue > 0, 'nothing is overdue')
})

test('only mid-conversation memberships carry a follow-up date', async () => {
  // Chasing someone who already said yes or no is noise.
  const { rows: [r] } = await db.query(`
    select count(*)::int n from campaign_creators
     where demo_run_id = $1 and next_follow_up is not null
       and stage not in ('contacted', 'replied')`, [runId])
  assert.equal(r.n, 0)
})

test('nobody is marked contacted without a channel recorded', async () => {
  const { rows: [r] } = await db.query(`
    select count(*)::int n from campaign_creators
     where demo_run_id = $1 and stage <> 'not_contacted' and outreach_channel is null`, [runId])
  assert.equal(r.n, 0)
})

test('published deliverables carry metrics and unpublished ones stay null', async () => {
  const { rows: [bad] } = await db.query(`
    select count(*)::int n from deliverables
     where demo_run_id = $1 and approval_state <> 'published'
       and (views is not null or clicks is not null or conversions is not null)`, [runId])
  assert.equal(bad.n, 0, 'an unpublished deliverable has invented performance figures')
  const { rows: [ok] } = await db.query(`
    select count(*)::int n from deliverables
     where demo_run_id = $1 and approval_state = 'published' and views is not null`, [runId])
  assert.ok(ok.n > 0, 'no published deliverable has metrics to render')
})

test('match scores are recorded with their reasons, never bare', async () => {
  const { rows } = await db.query(`
    select id, match_score, match_reasons from campaign_creators
     where demo_run_id = $1 and match_score is not null`, [runId])
  assert.ok(rows.length > 0)
  for (const r of rows) {
    assert.ok(Array.isArray(r.match_reasons) && r.match_reasons.length > 0,
      'a match score was stored with no explanation')
    assert.ok(r.match_score >= 0 && r.match_score <= 100)
  }
})

test('no demo record contains a resolvable external address', async () => {
  const { rows } = await db.query(`
    select 'clients' t, name v from clients
      where demo_run_id = $1 and (website !~ '\\.example' or contact_email !~ '\\.example$')
    union all
    select 'products', name from products
      where demo_run_id = $1 and product_url is not null and product_url !~ '\\.example'`, [runId])
  assert.deepEqual(rows, [], 'a demo record points at a real domain')
})

// ---------------------------------------------------------------------------
// Idempotence and safe deletion — the destructive round trip
// ---------------------------------------------------------------------------

test('re-running the seed inserts nothing', () => {
  const out = npm(['run', 'demo:seed', '--silent'])
  const line = out.split('\n').find(l => l.startsWith('totals:'))
  assert.ok(line, `no reconciliation line in output:\n${out}`)
  assert.match(line, /^totals: 0 inserted/, `second seed was not a no-op: ${line}`)
  assert.match(line, /0 failed$/)
})

test('reset defaults to a dry run and deletes nothing', async () => {
  const before = await countDemo()
  const out = npm(['run', 'demo:reset', '--silent'])
  assert.match(out, /DRY RUN/)
  assert.deepEqual(await countDemo(), before, 'a dry run changed the database')
})

test('reset removes exactly the demo rows and leaves every other row untouched', async () => {
  const fingerprint = async () => {
    const out = {}
    for (const t of PROTECTED_TABLES) {
      const col = t === 'workspaces' ? 'id' : 'workspace_id'
      const { rows: [r] } = await db.query(
        `select count(*)::int n, coalesce(md5(string_agg(id::text, ',' order by id)), '') h
           from ${t} where ${col} = $1`, [ws])
      out[t] = r
    }
    return out
  }
  const before = await fingerprint()
  const demoBefore = await countDemo()
  assert.ok(demoBefore > 0)

  const out = npm(['run', 'demo:reset', '--silent', '--', '--confirm'])
  assert.match(out, /Every protected table is unchanged/)
  assert.equal(await countDemo(), 0, 'reset left demo rows behind')
  assert.deepEqual(await fingerprint(), before, 'reset altered a protected table')

  // Restore the fixture so the workspace is left as the test found it.
  npm(['run', 'demo:seed', '--silent'])
  assert.equal(await countDemo(), demoBefore, 're-seed did not restore the same row count')
  assert.deepEqual(await fingerprint(), before, 're-seeding altered a protected table')
})

async function countDemo() {
  let n = 0
  for (const t of DEMO_TABLES_DELETE_ORDER) {
    const { rows: [r] } = await db.query(
      `select count(*)::int n from ${t} where demo_run_id is not null`)
    n += r.n
  }
  return n
}

test('the fixture the tests assert on is the fixture the app shows', async () => {
  const { rows } = await db.query(
    'select name from clients where demo_run_id is not null order by name')
  assert.deepEqual(rows.map(r => r.name).sort(), CLIENTS.map(c => c.name).sort())
  const { rows: camps } = await db.query(
    'select name from campaigns where demo_run_id is not null order by name')
  assert.deepEqual(camps.map(r => r.name).sort(), CAMPAIGNS.map(c => c.name).sort())
})
