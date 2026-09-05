// Restores a scripts/backup.mjs snapshot into a Supabase project.
//
// The target must already have the schema — run the migrations first:
//   for f in supabase/migrations/*.sql; do node scripts/apply-migration.mjs "$f"; done
//   node scripts/restore.mjs backups/clonyfy-<stamp>.json.gz
//
// Flags:
//   --target <ref>  restore into a different project (reads <REF>_DB_PASSWORD
//                   or --password); default is the project in .env.local
//   --wipe          delete existing rows first (child-to-parent) — required when
//                   the target is non-empty and you want an exact mirror
//   --dry           report what would be written, change nothing
//
// Rows are inserted parent-first and ON CONFLICT (id) DO NOTHING, so a re-run is
// idempotent. auth.users is restored with its password hashes, so logins survive.
import fs from 'node:fs'
import zlib from 'node:zlib'
import pg from 'pg'
import { connect, readEnv } from './db.mjs'
import { TABLE_ORDER } from './backup.mjs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const has = n => args.includes(`--${n}`)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

if (!file) { console.error('usage: node scripts/restore.mjs <backup.json.gz> [--target ref] [--wipe] [--dry]'); process.exit(1) }
if (!fs.existsSync(file)) { console.error(`no such backup: ${file}`); process.exit(1) }

const DRY = has('dry')
const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString())
console.log(`[restore] snapshot from ${snapshot.meta.taken_at} (project ${snapshot.meta.project_ref})`)

// Connect either to the default project or an explicit target ref.
async function target() {
  const ref = flag('target')
  if (!ref) return connect()
  const env = readEnv()
  const password = flag('password', env[`${ref.toUpperCase()}_DB_PASSWORD`] || env.BACKUP_DB_PASSWORD)
  if (!password) throw new Error(`no password for target ${ref} — pass --password or set BACKUP_DB_PASSWORD`)
  for (const prefix of ['aws-0', 'aws-1']) {
    for (const region of ['us-east-1', 'us-east-2', 'us-west-1', 'eu-central-1']) {
      const c = new pg.Client({
        host: `${prefix}-${region}.pooler.supabase.com`, port: 5432,
        user: `postgres.${ref}`, password, database: 'postgres',
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000,
      })
      try { await c.connect(); await c.query('select 1'); console.log(`[restore] target ${ref} via ${prefix}-${region}`); return c }
      catch (e) {
        await c.end().catch(() => {})
        if (/password authentication failed|Tenant or user not found/i.test(String(e.message))) throw e
      }
    }
  }
  throw new Error(`could not reach target project ${ref}`)
}

const client = await target()
let written = 0
try {
  if (has('wipe')) {
    if (DRY) console.log('[restore] --dry: would wipe all tables')
    else {
      for (const t of [...TABLE_ORDER].reverse()) {
        await client.query(`delete from public.${t}`).catch(() => {})
      }
      console.log('[restore] wiped existing rows')
    }
  }

  // auth.users first — public.users has an FK onto it.
  for (const u of snapshot.auth_users) {
    const cols = Object.keys(u)
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `insert into auth.users (${cols.join(', ')}) values (${ph}) on conflict (id) do nothing`
    if (!DRY) await client.query(sql, cols.map(c => u[c]))
    written++
  }
  // GoTrue scans these columns into non-nullable Go strings. A NULL makes every
  // sign-in fail with "Database error querying schema" even though the row and
  // password hash look correct. Supabase's own default for all of them is ''.
  if (!DRY && snapshot.auth_users.length) {
    for (const col of ['confirmation_token', 'recovery_token', 'email_change',
      'email_change_token_new', 'email_change_token_current', 'phone_change',
      'phone_change_token', 'reauthentication_token']) {
      const ok = await client.query(`select 1 from information_schema.columns
        where table_schema='auth' and table_name='users' and column_name=$1`, [col])
      if (ok.rowCount) await client.query(`update auth.users set ${col}='' where ${col} is null`)
    }
    await client.query(`update auth.users
      set instance_id='00000000-0000-0000-0000-000000000000' where instance_id is null`)
  }
  console.log(`[restore] auth users: ${snapshot.auth_users.length}`)

  // Identities must follow auth.users (FK) and are required for password login.
  for (const ident of (snapshot.auth_identities || [])) {
    const cols = Object.keys(ident)
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `insert into auth.identities (${cols.join(', ')}) values (${ph}) on conflict (id) do nothing`
    if (!DRY) await client.query(sql, cols.map(c => ident[c]))
    written++
  }
  console.log(`[restore] auth identities: ${(snapshot.auth_identities || []).length}`)
  if (snapshot.auth_users.length && !(snapshot.auth_identities || []).length) {
    console.warn('[restore] WARNING: snapshot predates identity backup — password sign-in will fail until auth.identities is repaired')
  }

  for (const t of TABLE_ORDER) {
    const rows = snapshot.tables[t] || []
    if (!rows.length) continue
    for (const r of rows) {
      const cols = Object.keys(r)
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
      const sql = `insert into public.${t} (${cols.map(c => `"${c}"`).join(', ')}) values (${ph}) on conflict do nothing`
      if (!DRY) await client.query(sql, cols.map(c => r[c]))
      written++
    }
    console.log(`[restore] ${t.padEnd(18)} ${rows.length}`)
  }
  console.log(`[restore] ${DRY ? 'would write' : 'wrote'} ${written} rows`)
} finally {
  await client.end()
}
