/**
 * Shared plumbing for the demo seed and reset scripts.
 *
 * The two scripts must agree exactly on which rows belong to a demo run and in
 * what order those rows may be deleted, so both of those facts live here.
 */
import { connect } from './db.mjs'
import { DEMO_LABEL } from './demo-fixture.mjs'

/**
 * Child-before-parent. reset-demo.mjs walks this array in order, so a foreign
 * key can never block a delete and no row is ever orphaned mid-run.
 */
export const DEMO_TABLES_DELETE_ORDER = [
  'deliverables',
  'offers',
  'outreach_activities',
  'campaign_creators',
  'templates',
  'notifications',
  'activity_log',
  'campaigns',
  'products',
  'clients',
]

/** Tables never touched by seed or reset, asserted by the tests. */
export const PROTECTED_TABLES = ['influencers', 'users', 'workspaces', 'pipeline', 'deals', 'deal_videos']

export async function open() {
  const c = await connect()
  return c
}

/** The single workspace and its admin. The seed is always workspace-scoped. */
export async function resolveWorkspace(c, wanted) {
  const { rows } = await c.query(
    wanted
      ? 'select id, name from workspaces where id = $1'
      : 'select id, name from workspaces order by created_at limit 2',
    wanted ? [wanted] : [],
  )
  if (!rows.length) throw new Error('No workspace found. Run npm run bootstrap first.')
  if (!wanted && rows.length > 1) {
    throw new Error('More than one workspace exists. Pass --workspace <id> to choose one.')
  }
  const ws = rows[0]
  const { rows: admins } = await c.query(
    `select id, name from users where workspace_id = $1
      order by (role = 'admin') desc, created_at limit 1`, [ws.id])
  if (!admins.length) throw new Error(`Workspace ${ws.name} has no users.`)
  return { workspace: ws, actor: admins[0] }
}

/** Finds this workspace's demo run, creating it only when `create` is set. */
export async function findRun(c, workspaceId, { create = false, actorId = null, label = DEMO_LABEL } = {}) {
  const { rows } = await c.query(
    'select id, label, scenario, created_at from demo_runs where workspace_id = $1 and label = $2',
    [workspaceId, label])
  if (rows.length) return { run: rows[0], created: false }
  if (!create) return { run: null, created: false }
  const { rows: made } = await c.query(
    `insert into demo_runs (workspace_id, label, scenario, seeded_by, notes)
     values ($1, $2, $3, $4, $5)
     returning id, label, scenario, created_at`,
    [workspaceId, label, 'Influencer operations walkthrough', actorId,
     'Simulated operational records for demonstration. Creator profiles referenced by these records are real catalog entries and are never modified or deleted by the demo scripts.'])
  return { run: made[0], created: true }
}

/** Row counts per table for one demo run. */
export async function countRun(c, runId) {
  const out = {}
  for (const t of DEMO_TABLES_DELETE_ORDER) {
    const { rows } = await c.query(`select count(*)::int n from ${t} where demo_run_id = $1`, [runId])
    out[t] = rows[0].n
  }
  return out
}

/** A fingerprint of every protected table, so a test can prove reset changed nothing. */
export async function fingerprintProtected(c, workspaceId) {
  const out = {}
  for (const t of PROTECTED_TABLES) {
    try {
      const scoped = t === 'workspaces' ? 'id' : 'workspace_id'
      const { rows } = await c.query(
        `select count(*)::int n, coalesce(md5(string_agg(id::text, ',' order by id)), '') h
           from ${t} where ${scoped} = $1`, [workspaceId])
      out[t] = rows[0]
    } catch (e) { out[t] = { error: e.message } }
  }
  return out
}

/** Deterministic small integer from a string — used instead of Math.random. */
export function hashInt(s, mod) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h) % mod
}

export const dayOffset = (n) => {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}
export const isoDate = (n) => dayOffset(n).toISOString().slice(0, 10)
export const isoTs = (n) => dayOffset(n).toISOString()

/** Right-padded reconciliation table, printed by both scripts. */
export function printTable(title, rows, cols) {
  console.log('\n' + title)
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)))
  const line = (cells) => '  ' + cells.map((v, i) => String(v).padEnd(widths[i])).join('  ')
  console.log(line(cols))
  console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '))
  for (const r of rows) console.log(line(cols.map(c => r[c] ?? '')))
}
