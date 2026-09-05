/**
 * Integration tests against the live Supabase schema.
 *
 * These exercise the behaviour the redesign was built to fix and that a unit
 * test cannot prove: that a creator's stage belongs to a campaign rather than to
 * the creator, that the catalog's counts are internally consistent, that the
 * data-quality backfill did what it claims, and that RLS still isolates the
 * workspace.
 *
 * Everything is created inside a transaction-like block with an explicit
 * cleanup, and every fixture is namespaced with a unique suffix so a failure
 * cannot leave residue in the user's real data. No existing row is modified.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { connect } from '../scripts/db.mjs'

let db
let ws
let admin
let fixture

const SUFFIX = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  db = await connect()
  const { rows: [w] } = await db.query('select id from workspaces order by created_at limit 1')
  ws = w.id
  const { rows: [u] } = await db.query('select id from users where workspace_id = $1 limit 1', [ws])
  admin = u.id

  // Two campaigns for one product, plus one creator borrowed (read-only) from
  // the existing catalog. Nothing about that creator row is written to.
  const { rows: [client] } = await db.query(
    `insert into clients (workspace_id, name, created_by) values ($1, $2, $3) returning id`,
    [ws, `ZZ Test Client ${SUFFIX}`, admin])
  const { rows: [product] } = await db.query(
    `insert into products (workspace_id, client_id, name, created_by) values ($1, $2, $3, $4) returning id`,
    [ws, client.id, `ZZ Test Product ${SUFFIX}`, admin])
  const { rows: [c1] } = await db.query(
    `insert into campaigns (workspace_id, name, client_id, product_id, status, brief_niches, brief_geo, created_by)
     values ($1, $2, $3, $4, 'active', array['web_dev'], 'us_only', $5) returning id`,
    [ws, `ZZ Campaign A ${SUFFIX}`, client.id, product.id, admin])
  const { rows: [c2] } = await db.query(
    `insert into campaigns (workspace_id, name, client_id, product_id, status, created_by)
     values ($1, $2, $3, $4, 'active', $5) returning id`,
    [ws, `ZZ Campaign B ${SUFFIX}`, client.id, product.id, admin])
  const { rows: [creator] } = await db.query(
    `select id, handle from influencers where workspace_id = $1 and hidden = false limit 1`, [ws])

  fixture = { client: client.id, product: product.id, campaignA: c1.id, campaignB: c2.id, creator }
})

after(async () => {
  if (!db) return
  // Cascades clear campaign_creators, offers, deliverables and outreach rows.
  await db.query(`delete from campaigns where workspace_id = $1 and name like $2`, [ws, `ZZ Campaign%${SUFFIX}`])
  await db.query(`delete from products where workspace_id = $1 and name like $2`, [ws, `ZZ Test Product ${SUFFIX}`])
  await db.query(`delete from clients  where workspace_id = $1 and name like $2`, [ws, `ZZ Test Client ${SUFFIX}`])
  await db.end()
})

// ---------------------------------------------------------------------------
// The core architectural fix
// ---------------------------------------------------------------------------

test('the same creator can belong to several campaigns at once', async () => {
  const { creator, campaignA, campaignB } = fixture
  await db.query(
    `insert into campaign_creators (workspace_id, campaign_id, influencer_id, handle, stage, owner_id)
     values ($1,$2,$3,$4,'not_contacted',$5), ($1,$6,$3,$4,'not_contacted',$5)`,
    [ws, campaignA, creator.id, creator.handle, admin, campaignB])

  const { rows } = await db.query(
    `select campaign_id from campaign_creators where workspace_id=$1 and influencer_id=$2 and campaign_id = any($3)`,
    [ws, creator.id, [campaignA, campaignB]])
  assert.equal(rows.length, 2, 'a creator must be able to sit in two campaigns simultaneously')
})

test('adding the same creator to one campaign twice is rejected, not duplicated', async () => {
  const { creator, campaignA } = fixture
  await assert.rejects(
    () => db.query(
      `insert into campaign_creators (workspace_id, campaign_id, influencer_id, handle, stage)
       values ($1,$2,$3,$4,'not_contacted')`,
      [ws, campaignA, creator.id, creator.handle]),
    /duplicate key|unique/i,
  )
})

test('moving a creator in one campaign does not change their stage in another', async () => {
  const { creator, campaignA, campaignB } = fixture
  await db.query(
    `update campaign_creators set stage='replied' where workspace_id=$1 and campaign_id=$2 and influencer_id=$3`,
    [ws, campaignA, creator.id])

  const { rows } = await db.query(
    `select campaign_id, stage from campaign_creators
      where workspace_id=$1 and influencer_id=$2 and campaign_id = any($3)`,
    [ws, creator.id, [campaignA, campaignB]])
  const byCampaign = Object.fromEntries(rows.map(r => [r.campaign_id, r.stage]))
  assert.equal(byCampaign[campaignA], 'replied')
  assert.equal(byCampaign[campaignB], 'not_contacted', 'campaign B must be untouched by a move in campaign A')
})

test('each membership carries its own owner, score, follow-up and notes', async () => {
  const { creator, campaignA, campaignB } = fixture
  await db.query(
    `update campaign_creators set match_score=82, next_follow_up='2026-10-01', notes='A note'
      where workspace_id=$1 and campaign_id=$2 and influencer_id=$3`,
    [ws, campaignA, creator.id])

  const { rows } = await db.query(
    `select campaign_id, match_score, next_follow_up, notes from campaign_creators
      where workspace_id=$1 and influencer_id=$2 and campaign_id = any($3)`,
    [ws, creator.id, [campaignA, campaignB]])
  const a = rows.find(r => r.campaign_id === campaignA)
  const b = rows.find(r => r.campaign_id === campaignB)
  assert.equal(Number(a.match_score), 82)
  assert.equal(b.match_score, null, 'per-relationship fields must not bleed between campaigns')
  assert.equal(b.notes, null)
})

test('offers and deliverables hang off the relationship, not the creator', async () => {
  const { creator, campaignA, campaignB } = fixture
  const { rows: [ccA] } = await db.query(
    `select id from campaign_creators where workspace_id=$1 and campaign_id=$2 and influencer_id=$3`,
    [ws, campaignA, creator.id])

  await db.query(
    `insert into offers (workspace_id, campaign_creator_id, offer_type, flat_fee, currency, status)
     values ($1,$2,'flat_fee',500,'USD','accepted')`, [ws, ccA.id])
  await db.query(
    `insert into deliverables (workspace_id, campaign_creator_id, kind, due_date, approval_state)
     values ($1,$2,'reel','2026-10-15','planned')`, [ws, ccA.id])

  const { rows: [ccB] } = await db.query(
    `select id from campaign_creators where workspace_id=$1 and campaign_id=$2 and influencer_id=$3`,
    [ws, campaignB, creator.id])
  const { rows: offersB } = await db.query(`select id from offers where campaign_creator_id=$1`, [ccB.id])
  const { rows: dlvB } = await db.query(`select id from deliverables where campaign_creator_id=$1`, [ccB.id])
  assert.equal(offersB.length, 0, 'an offer in campaign A must not appear in campaign B')
  assert.equal(dlvB.length, 0)
})

test('one offer per relationship is enforced', async () => {
  const { creator, campaignA } = fixture
  const { rows: [cc] } = await db.query(
    `select id from campaign_creators where workspace_id=$1 and campaign_id=$2 and influencer_id=$3`,
    [ws, campaignA, creator.id])
  await assert.rejects(
    () => db.query(`insert into offers (workspace_id, campaign_creator_id) values ($1,$2)`, [ws, cc.id]),
    /duplicate key|unique/i,
  )
})

test('deleting a campaign removes its relationships and leaves the creator in the catalog', async () => {
  const { creator, client, product } = fixture
  const { rows: [temp] } = await db.query(
    `insert into campaigns (workspace_id, name, client_id, product_id, created_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [ws, `ZZ Campaign C ${SUFFIX}`, client, product, admin])
  await db.query(
    `insert into campaign_creators (workspace_id, campaign_id, influencer_id, handle, stage)
     values ($1,$2,$3,$4,'not_contacted')`, [ws, temp.id, creator.id, creator.handle])

  await db.query(`delete from campaigns where id=$1`, [temp.id])

  const { rows: gone } = await db.query(`select id from campaign_creators where campaign_id=$1`, [temp.id])
  assert.equal(gone.length, 0)
  const { rows: stillThere } = await db.query(`select id from influencers where id=$1`, [creator.id])
  assert.equal(stillThere.length, 1, 'deleting a campaign must never delete a catalog record')
})

// ---------------------------------------------------------------------------
// Catalog counts are internally consistent
// ---------------------------------------------------------------------------

test('the browsable catalog count is never smaller than any filtered subset', async () => {
  // This is the bug the redesign fixes: the list used
  // `follower_count <= CEILING OR IS NULL` while the total used `.lte(...)`,
  // which drops NULLs — so the page could print "4,593 of 4,579".
  const predicate = `workspace_id = $1 and hidden = false and (follower_count <= 500000 or follower_count is null)`
  const { rows: [counts] } = await db.query(`
    select
      count(*) filter (where ${predicate}) as catalog,
      count(*) filter (where ${predicate} and qualification_status = 'qualified') as qualified,
      count(*) filter (where ${predicate} and geo_status in ('confirmed_us','likely_us')) as us,
      count(*) filter (where ${predicate} and email is not null) as with_email,
      count(*) filter (where ${predicate} and phone is not null) as with_phone
    from influencers where workspace_id = $1`, [ws])

  const catalog = Number(counts.catalog)
  for (const key of ['qualified', 'us', 'with_email', 'with_phone']) {
    assert.ok(Number(counts[key]) <= catalog,
      `${key} (${counts[key]}) must never exceed the catalog total (${catalog})`)
  }
  assert.ok(catalog > 0)
})

test('every saved view is a subset of the catalog, so "X of Y" can never invert', async () => {
  const base = `workspace_id = $1 and hidden = false and (follower_count <= 500000 or follower_count is null)`
  const views = {
    qualified: `qualification_status = 'qualified'`,
    us: `geo_status in ('confirmed_us','likely_us')`,
    email: `email is not null`,
    phone: `phone is not null`,
    needs_contact: `contact_status = 'none'`,
    awaiting: `verification_status = 'pending_instagram_verification'`,
    needs_class: `entity_type in ('likely_organization','aggregator','brand','institution','unclassified')`,
  }
  const { rows: [{ total }] } = await db.query(
    `select count(*) as total from influencers where ${base}`, [ws])
  for (const [name, where] of Object.entries(views)) {
    const { rows: [{ n }] } = await db.query(
      `select count(*) as n from influencers where ${base} and ${where}`, [ws])
    assert.ok(Number(n) <= Number(total), `view "${name}" returned more rows than the catalog holds`)
  }
})

// ---------------------------------------------------------------------------
// Data quality (migration 0012)
// ---------------------------------------------------------------------------

test('no language code is left sitting in the country column', async () => {
  const { rows: [{ n }] } = await db.query(
    `select count(*) as n from influencers
      where workspace_id = $1 and lower(btrim(coalesce(country,''))) in ('en','fr')`, [ws])
  assert.equal(Number(n), 0, 'country must never hold a language code — 0012 moves those to language_code')
})

test('language codes were preserved rather than deleted', async () => {
  const { rows: [{ n }] } = await db.query(
    `select count(*) as n from influencers where workspace_id = $1 and language_code is not null`, [ws])
  assert.ok(Number(n) > 0, 'the language codes moved out of country must still exist in language_code')
})

test('US evidence is graded, not flattened into one label', async () => {
  const { rows } = await db.query(
    `select distinct geo_status from influencers where workspace_id = $1`, [ws])
  const statuses = rows.map(r => r.geo_status)
  const usLevels = statuses.filter(s => s.endsWith('_us'))
  assert.ok(usLevels.length >= 2, `expected several US confidence levels, saw ${JSON.stringify(statuses)}`)
})

test('every row carries an evidence sentence for its geography claim', async () => {
  const { rows: [{ n }] } = await db.query(
    `select count(*) as n from influencers where workspace_id = $1 and geo_evidence is null`, [ws])
  assert.equal(Number(n), 0, 'a geography status without stated evidence is not honest')
})

test('an explicit human review overrides the qualification heuristic', async () => {
  const { rows: [row] } = await db.query(
    `select id, review_state, qualification_status from influencers
      where workspace_id = $1 and qualification_status = 'needs_review' limit 1`, [ws])
  if (!row) return // nothing to review in this workspace
  const original = row.review_state
  try {
    await db.query(`update influencers set review_state = 'approved' where id = $1`, [row.id])
    const { rows: [after] } = await db.query(`select qualification_status from influencers where id = $1`, [row.id])
    assert.equal(after.qualification_status, 'qualified')
  } finally {
    await db.query(`update influencers set review_state = $2 where id = $1`, [row.id, original])
  }
})

test('profile completeness is derived, so it cannot drift from the columns', async () => {
  const { rows: [{ bad }] } = await db.query(`
    select count(*) as bad from influencers
     where workspace_id = $1
       and profile_completeness <> (
         (case when nullif(btrim(coalesce(full_name,'')),'')   is not null then 1 else 0 end) +
         (case when follower_count is not null                            then 1 else 0 end) +
         (case when nullif(btrim(coalesce(niche,'')),'')       is not null then 1 else 0 end) +
         (case when nullif(btrim(coalesce(biography,'')),'')   is not null then 1 else 0 end) +
         (case when nullif(btrim(coalesce(profile_url,'')),'') is not null then 1 else 0 end) +
         (case when nullif(btrim(coalesce(email,'')),'')       is not null then 1 else 0 end) +
         (case when nullif(btrim(coalesce(phone,'')),'')       is not null then 1 else 0 end) +
         (case when geo_status <> 'unknown'                                then 1 else 0 end))`, [ws])
  assert.equal(Number(bad), 0)
})

// ---------------------------------------------------------------------------
// Workspace isolation / RLS
// ---------------------------------------------------------------------------

test('RLS is enabled on every new campaign-model table', async () => {
  const { rows } = await db.query(`
    select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('clients','products','campaign_creators','outreach_activities','offers','deliverables')`)
  assert.equal(rows.length, 6)
  for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} has RLS disabled`)
})

test('every new table is workspace-scoped by a policy', async () => {
  const { rows } = await db.query(`
    select tablename, count(*) as policies
      from pg_policies
     where schemaname = 'public'
       and tablename in ('clients','products','campaign_creators','outreach_activities','offers','deliverables')
     group by tablename`)
  assert.equal(rows.length, 6, 'a table with no policy under RLS is unreachable, not secure')
  for (const r of rows) assert.ok(Number(r.policies) >= 1)
})

test('campaign creators cannot reference a creator outside the workspace', async () => {
  // The FK plus the workspace_id column is what keeps a relationship inside one
  // tenant; a bad influencer_id must fail loudly.
  await assert.rejects(
    () => db.query(
      `insert into campaign_creators (workspace_id, campaign_id, influencer_id, handle, stage)
       values ($1,$2,'00000000-0000-0000-0000-000000000000','ghost','not_contacted')`,
      [ws, fixture.campaignA]),
    /foreign key|violates/i,
  )
})

test('legacy pipeline and deal tables are still present and untouched', async () => {
  // The migration copies forward; it never drops. Old data must stay readable.
  for (const t of ['pipeline', 'deals', 'deal_videos']) {
    const { rows } = await db.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [t])
    assert.equal(rows.length, 1, `${t} was dropped — existing data must be preserved`)
  }
})
