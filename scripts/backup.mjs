// Logical backup of the Clonyfy CRM database.
//
// Why not pg_dump: it isn't installed here and would add a system dependency to
// a step that must never fail. This walks every public table plus the auth.users
// rows the app depends on and writes one gzipped JSON snapshot. Schema is NOT
// dumped — it lives in supabase/migrations/, so a restore is "apply migrations,
// then replay this data".
//
//   node scripts/backup.mjs                 → backups/clonyfy-<timestamp>.json.gz
//   node scripts/backup.mjs --out path.gz   → explicit destination
//   node scripts/backup.mjs --keep 20       → prune to the N newest (default 30)
//
// Restore with scripts/restore.mjs. Mirror to the standby project with
// scripts/sync-backup-db.mjs.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { connect } from './db.mjs'

// Parent-before-child so a restore can replay this array in order without
// tripping foreign keys.
export const TABLE_ORDER = [
  'workspaces',
  'users',
  'influencers',
  'campaigns',
  'pipeline',
  'assignments',
  'deals',
  'deal_videos',
  'templates',
  'saved_lists',
  'collaborations',
  'comments',
  'activity_log',
  'reassignment_log',
  'notifications',
]

// auth.users columns we can legitimately restore. The password hash is included
// so accounts survive a rebuild — treat every dump as a secret.
const AUTH_COLS = [
  'instance_id', 'id', 'email', 'encrypted_password', 'email_confirmed_at',
  'created_at', 'updated_at', 'raw_user_meta_data', 'raw_app_meta_data',
  'aud', 'role', 'confirmation_token', 'recovery_token', 'email_change',
  'email_change_token_new', 'is_sso_user', 'is_anonymous',
]

// GoTrue refuses email/password sign-in unless the user also has an
// auth.identities row — restoring auth.users alone produces an account that
// exists but cannot log in. Learned the hard way on 2026-09-02.
const IDENTITY_COLS = [
  'id', 'user_id', 'provider_id', 'identity_data', 'provider',
  'last_sign_in_at', 'created_at', 'updated_at',
]

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

export async function dump(client) {
  const snapshot = { meta: {}, auth_users: [], auth_identities: [], tables: {} }

  const ref = (fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    .match(/^SUPABASE_PROJECT_REF=(.+)$/m) || [])[1] || 'unknown'
  snapshot.meta = { taken_at: new Date().toISOString(), project_ref: ref.trim(), format: 1 }

  const { rows: authRows } = await client.query(
    `select ${AUTH_COLS.join(', ')} from auth.users order by created_at`)
  snapshot.auth_users = authRows

  const { rows: identRows } = await client.query(
    `select ${IDENTITY_COLS.join(', ')} from auth.identities order by created_at`)
  snapshot.auth_identities = identRows

  for (const t of TABLE_ORDER) {
    const exists = await client.query(
      `select 1 from pg_tables where schemaname='public' and tablename=$1`, [t])
    if (!exists.rowCount) { snapshot.tables[t] = []; continue }
    const { rows } = await client.query(`select * from public.${t}`)
    snapshot.tables[t] = rows
  }
  return snapshot
}

function prune(dir, keep) {
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('clonyfy-') && f.endsWith('.json.gz'))
    .sort()
    .reverse()
  for (const f of files.slice(keep)) fs.unlinkSync(path.join(dir, f))
  return Math.max(0, files.length - keep)
}

async function main() {
  const client = await connect()
  try {
    const snapshot = await dump(client)
    const dir = path.join(process.cwd(), 'backups')
    fs.mkdirSync(dir, { recursive: true })

    const stamp = snapshot.meta.taken_at.replace(/[:.]/g, '-')
    const out = flag('out', path.join(dir, `clonyfy-${stamp}.json.gz`))
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 })
    fs.writeFileSync(out, gz)

    const counts = Object.entries(snapshot.tables).filter(([, r]) => r.length)
    const total = counts.reduce((n, [, r]) => n + r.length, 0)
    console.log(`[backup] ${out}`)
    console.log(`[backup] ${(gz.length / 1024).toFixed(0)} KB · ${total} rows · ${snapshot.auth_users.length} auth users · ${snapshot.auth_identities.length} identities`)
    for (const [t, r] of counts) console.log(`           ${t.padEnd(18)} ${r.length}`)

    const pruned = prune(dir, Number(flag('keep', 30)))
    if (pruned) console.log(`[backup] pruned ${pruned} old snapshot(s)`)
  } finally {
    await client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
