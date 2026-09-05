// Replaces the workspace admin with a brand-new account, keeping the workspace
// and every row in it.
//
//   node scripts/rotate-admin.mjs <new-email> [--dry]
//
// Order matters. The workspace CASCADEs on delete, so the new owner has to be
// fully in place and every reference repointed BEFORE the old account goes —
// otherwise a FK either blocks the delete or takes the catalog with it.
//
// Sign-in also needs auth.identities, not just auth.users: without a matching
// identity row Supabase returns 400 invalid_credentials despite a correct
// password hash. admin.createUser() writes both, which is why this uses the
// admin API rather than inserting into auth.users directly.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { connect } from './db.mjs'

const email = (process.argv[2] || '').trim().toLowerCase()
const DRY = process.argv.includes('--dry')
if (!email || !email.includes('@')) {
  console.error('usage: node scripts/rotate-admin.mjs <new-email> [--dry]')
  process.exit(1)
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

// Ambiguity-free alphabet (no O/0, l/1) since this gets typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const pick = n => Array.from(crypto.randomFillSync(new Uint32Array(n)))
  .map(x => ALPHABET[x % ALPHABET.length]).join('')
const password = `${pick(5)}-${pick(5)}-${pick(5)}!7`

const c = await connect()
const q = async (s, p) => (await c.query(s, p)).rows

const wss = await q('select id, name, created_by from workspaces')
if (wss.length !== 1) { console.error(`expected 1 workspace, found ${wss.length}`); process.exit(1) }
const ws = wss[0]
const olds = await q('select id, email, name, role from users where workspace_id = $1', [ws.id])
const counts = (await q(`select (select count(*) from influencers where workspace_id=$1)::int influencers,
  (select count(*) from pipeline where workspace_id=$1)::int pipeline,
  (select count(*) from deals where workspace_id=$1)::int deals`, [ws.id]))[0]

console.log(`workspace : ${ws.name} (${ws.id})`)
console.log(`contains  : ${counts.influencers} influencers · ${counts.pipeline} pipeline · ${counts.deals} deals`)
console.log(`existing  : ${olds.map(u => `${u.email} [${u.role}]`).join(', ') || 'none'}`)
console.log(`new admin : ${email}`)
if (DRY) { console.log('\n(dry run — nothing changed)'); await c.end(); process.exit(0) }

// 1. create the auth user (writes auth.identities too)
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { name: 'Admin' },
})
if (cErr) { console.error('createUser failed: ' + cErr.message); await c.end(); process.exit(1) }
const newId = created.user.id
console.log(`\n[1] auth user created  ${newId}`)

try {
  await c.query('begin')

  // 2. profile row in the SAME workspace. The admin-cap trigger allows two, so
  //    the new admin can coexist with the old one for the length of this swap.
  await c.query(
    `insert into users (id, workspace_id, name, email, role, invite_accepted)
     values ($1, $2, 'Admin', $3, 'admin', true)`, [newId, ws.id, email])
  console.log('[2] profile row inserted (admin)')

  // 3. repoint everything that referenced the outgoing admin
  const oldIds = olds.map(u => u.id)
  let moved = 0
  if (oldIds.length) {
    for (const [table, col] of [
      ['workspaces', 'created_by'], ['activity_log', 'user_id'],
      ['assignments', 'assigned_to'], ['assignments', 'assigned_by'],
      ['campaigns', 'created_by'], ['comments', 'author_id'],
      ['deals', 'owner_id'], ['deals', 'created_by'],
      ['notifications', 'user_id'], ['pipeline', 'assigned_to'], ['pipeline', 'assigned_by'],
      ['reassignment_log', 'admin_id'], ['reassignment_log', 'from_user_id'],
      ['reassignment_log', 'to_user_id'], ['saved_lists', 'created_by'],
      ['templates', 'created_by'],
    ]) {
      const r = await c.query(
        `update ${table} set ${col} = $1 where ${col} = any($2::uuid[])`, [newId, oldIds])
      if (r.rowCount) { console.log(`    ${table}.${col}: ${r.rowCount} row(s) repointed`); moved += r.rowCount }
    }
  }
  console.log(`[3] ${moved} reference(s) repointed to the new admin`)

  // 4. drop the old profile rows (never the workspace — that would cascade)
  const del = await c.query('delete from users where workspace_id = $1 and id <> $2', [ws.id, newId])
  console.log(`[4] ${del.rowCount} old profile row(s) deleted`)

  await c.query('commit')
} catch (e) {
  await c.query('rollback')
  console.error('\nFAILED, rolled back: ' + e.message)
  await admin.auth.admin.deleteUser(newId).catch(() => {})
  console.error('new auth user removed; nothing changed')
  await c.end(); process.exit(1)
}

// 5. only now remove the old auth identities
for (const u of olds) {
  const { error } = await admin.auth.admin.deleteUser(u.id)
  console.log(error ? `[5] could not delete auth user ${u.email}: ${error.message}`
                    : `[5] auth user deleted  ${u.email}`)
}

// 6. prove the new credentials actually sign in
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } })
const { data: s, error: sErr } = await anon.auth.signInWithPassword({ email, password })
console.log(sErr ? `[6] SIGN-IN FAILED: ${sErr.message}` : '[6] sign-in verified ✓')

const after = (await q(`select (select count(*) from users where workspace_id=$1)::int users,
  (select count(*) from influencers where workspace_id=$1)::int influencers`, [ws.id]))[0]
console.log(`\nworkspace now: ${after.users} user · ${after.influencers} influencers (was ${counts.influencers})`)
console.log('\n' + '='.repeat(52))
console.log('  NEW LOGIN')
console.log(`  email    : ${email}`)
console.log(`  password : ${password}`)
console.log('='.repeat(52))
console.log('This password is shown once and is not stored anywhere.')
console.log('Change it in the app under /account after signing in.')
if (s?.session) await anon.auth.signOut().catch(() => {})
await c.end()
