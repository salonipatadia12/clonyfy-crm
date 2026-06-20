// One-off: set a fresh temp password for the admin account via service-role.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const EMAIL = 'manyamsoumithreddy@gmail.com'
const NEWPW = 'Clonyfy-' + Math.random().toString(36).slice(2, 10) + 'X9!'

const { data: list } = await admin.auth.admin.listUsers()
const user = list.users.find(u => u.email?.toLowerCase() === EMAIL)
if (!user) { console.log('❌ admin user not found'); process.exit(1) }

const { error } = await admin.auth.admin.updateUserById(user.id, { password: NEWPW, email_confirm: true })
if (error) { console.log('❌ ' + error.message); process.exit(1) }
console.log('✅ password reset for ' + EMAIL)
console.log('NEW PASSWORD: ' + NEWPW)
