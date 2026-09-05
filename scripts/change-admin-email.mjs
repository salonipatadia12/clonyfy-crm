/**
 * Changes the workspace admin's login email, in place.
 *
 *   node scripts/change-admin-email.mjs <new-email> [--dry]
 *
 * Deliberately narrower than rotate-admin.mjs: the auth user keeps its id, so
 * workspace ownership, assignments, activity_log and every other foreign key
 * stay exactly where they are, and the password is untouched.
 *
 * `email_confirm: true` is set so Supabase does not send a confirmation mail to
 * the new address — the account stays usable even if nobody reads that inbox.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { connect } from './db.mjs'

const email = (process.argv[2] || '').trim().toLowerCase()
const DRY = process.argv.includes('--dry')
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: node scripts/change-admin-email.mjs <new-email> [--dry]')
  process.exit(1)
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const c = await connect()
const { rows: users } = await c.query(
  `select id, email, name, role, workspace_id from users order by (role = 'admin') desc, created_at`)
if (users.length !== 1) {
  console.error(`expected exactly 1 user, found ${users.length}`)
  await c.end(); process.exit(1)
}
const user = users[0]

const { data: list, error: lErr } = await admin.auth.admin.listUsers()
if (lErr) { console.error(lErr.message); await c.end(); process.exit(1) }
const authUser = list.users.find(u => u.id === user.id)
if (!authUser) {
  console.error(`no auth user matching profile ${user.id}`)
  await c.end(); process.exit(1)
}

console.log(`user     : ${user.id}`)
console.log(`from     : ${authUser.email}`)
console.log(`to       : ${email}`)
console.log(`role     : ${user.role}`)
if (list.users.some(u => u.email?.toLowerCase() === email && u.id !== user.id)) {
  console.error('another auth user already has that email')
  await c.end(); process.exit(1)
}
if (DRY) { console.log('\n(dry run — nothing changed)'); await c.end(); process.exit(0) }

const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true })
if (error) { console.error('failed: ' + error.message); await c.end(); process.exit(1) }
console.log('\n[1] auth email updated')

await c.query('update users set email = $1 where id = $2', [email, user.id])
console.log('[2] profile row updated')

const { rows: after } = await c.query('select id, email, role, workspace_id from users')
console.log('[3] profile now: ' + JSON.stringify(after[0]))
const { data: check } = await admin.auth.admin.listUsers()
console.log(`[4] auth users : ${check.users.map(u => u.email).join(', ')}`)
console.log('\nThe password is unchanged. Sign in with the new email and your existing password.')
await c.end()
