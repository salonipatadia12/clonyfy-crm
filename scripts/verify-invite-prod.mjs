// End-to-end check of the prod invite/link flow after setting Supabase redirect URLs.
// Creates a throwaway user, generates the real recovery link (as inviteMember does),
// confirms the link redirects to PROD /set-password (not localhost), proves sign-in,
// then deletes the test user. Run: node scripts/verify-invite-prod.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const PROD = 'https://crm-pied-two-64.vercel.app'
const email = `clonyfy-prodtest-${Math.random().toString(36).slice(2, 8)}@example.com`
const pw = 'ProdTest-' + Math.random().toString(36).slice(2, 10) + 'A1!'

const admin = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })
const fail = (m) => { console.log('❌ ' + m); process.exitCode = 1 }
let userId

try {
  // 1. create the throwaway member (mirrors inviteMember createUser)
  const { data: c, error: ce } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
  if (ce) throw new Error('createUser: ' + ce.message)
  userId = c.user.id
  console.log(`1. created test user ${email}`)

  // 2. generate the recovery link with redirectTo = PROD/set-password (exactly inviteMember)
  const { data: link, error: le } = await admin.auth.admin.generateLink({
    type: 'recovery', email, options: { redirectTo: `${PROD}/set-password` },
  })
  if (le) throw new Error('generateLink: ' + le.message)
  const actionLink = link.properties.action_link
  const redirectParam = new URL(actionLink).searchParams.get('redirect_to')
  console.log(`2. action_link redirect_to = ${redirectParam}`)
  redirectParam === `${PROD}/set-password`
    ? console.log('   ✅ Supabase ACCEPTED the prod redirect (allowlist working)')
    : fail(`redirect_to is NOT prod — got "${redirectParam}". Allowlist/Site URL not applied.`)

  // 3. follow the verify link WITHOUT following redirects — confirm it 30x-redirects to PROD
  const res = await fetch(actionLink, { redirect: 'manual' })
  const loc = res.headers.get('location') || ''
  console.log(`3. GET action_link -> HTTP ${res.status}, Location starts: ${loc.slice(0, 60)}`)
  loc.startsWith(PROD)
    ? console.log('   ✅ link lands on PROD domain (not localhost)')
    : fail(`link redirected to "${loc.slice(0, 80)}" — not prod`)

  // 4. prove email+password sign-in works against the live project (temp-password path)
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password: pw })
  se ? fail('signIn: ' + se.message)
     : console.log(`4. ✅ sign-in OK — session for ${s.user.email} (temp-password path works)`)
} catch (e) {
  fail(e.message)
} finally {
  if (userId) { await admin.auth.admin.deleteUser(userId); console.log('5. cleaned up test user') }
  console.log(process.exitCode ? '\nRESULT: ⚠️  one or more checks failed (see above)' : '\nRESULT: ✅ invite flow is end-to-end on prod')
}
