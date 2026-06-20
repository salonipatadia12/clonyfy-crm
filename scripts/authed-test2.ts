// Phase 3-5 end-to-end: members/invite, assignments, reassign, notifications,
// templates CRUD, saved lists. Signs in as admin, exercises each, cleans up.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2]
  }
  return out
}
const REF = 'vyhkitdimdwifhtpiiqm', CHUNK = 3180, BASE = 'http://localhost:3000'

function cookieHeader(session: unknown): string {
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const name = `sb-${REF}-auth-token`
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts: string[] = []
  for (let i = 0, idx = 0; i < value.length; i += CHUNK, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + CHUNK)}`)
  return parts.join('; ')
}

async function main() {
  const env = readEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: 'manyamsoumithreddy@gmail.com', password: 'Clonyfy2026!' })
  if (error || !data.session) throw new Error('sign-in failed: ' + error?.message)
  const cookie = cookieHeader(data.session)
  const J = (m: string, p: string, b?: unknown) => fetch(BASE + p, { method: m, headers: { cookie, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, b: await r.json().catch(() => null) }))

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const testEmail = `member.${Date.now()}@clonyfy.test`

  // invite member
  const inv = await J('POST', '/api/members', { name: 'Test Member', email: testEmail, role: 'member' })
  console.log('[invite]', inv.s, 'tempPw=' + (inv.b?.tempPassword ? 'yes' : 'no'))
  const memberId = inv.b?.userId

  const members = await J('GET', '/api/members')
  console.log('[members]', members.s, 'count=' + (members.b?.members?.length))

  // pick a creator to assign
  const inf = await J('GET', '/api/influencers?pageSize=1&niche=design')
  const handle = inf.b?.rows?.[0]?.handle
  const assign = await J('POST', '/api/assignments', { memberId, handles: [handle] })
  console.log('[assign]', assign.s, JSON.stringify(assign.b))
  const masg = await J('GET', `/api/assignments?memberId=${memberId}`)
  console.log('[member assignments]', masg.s, 'rows=' + (masg.b?.rows?.length))

  // add to admin pipeline then reassign to member
  const add = await J('POST', '/api/pipeline/add', { handles: [handle] })
  const pipe = await J('GET', '/api/pipeline')
  const row = pipe.b?.rows?.find((r: { handle: string }) => r.handle === handle)
  console.log('[pipeline add]', add.s, 'rowFound=' + !!row)
  const re = await J('POST', `/api/pipeline/${row.id}/reassign`, { toUserId: memberId, reason: 'smoke' })
  console.log('[reassign]', re.s, JSON.stringify(re.b))

  // templates CRUD
  const tpl = await J('POST', '/api/templates', { name: 'Smoke', body: 'Hi {{first_name}} in {{niche}}' })
  const tlist = await J('GET', '/api/templates')
  console.log('[templates] create=' + tpl.s, 'count=' + (tlist.b?.templates?.length))
  if (tpl.b?.template?.id) await J('DELETE', `/api/templates/${tpl.b.template.id}`)

  // saved lists
  const sl = await J('POST', '/api/saved-lists', { name: 'Design 10k', filters: { niche: 'design', rangeKey: '10K-50K' } })
  const sllist = await J('GET', '/api/saved-lists')
  console.log('[saved-lists] create=' + sl.s, 'count=' + (sllist.b?.lists?.length))
  if (sl.b?.list?.id) await J('DELETE', `/api/saved-lists/${sl.b.list.id}`)

  // notifications (member got some; admin checks own)
  const notif = await J('GET', '/api/notifications')
  console.log('[notifications] admin unread=' + notif.b?.unread)

  // cleanup: remove member (moves their pipeline back to admin), delete the test pipeline row
  const rm = await J('DELETE', `/api/members/${memberId}`)
  console.log('[remove member]', rm.s)
  // delete any pipeline rows for the handle (now back on admin)
  await admin.from('pipeline').delete().eq('handle', handle)
  await admin.from('assignments').delete().eq('influencer_handle', handle)
  await admin.from('activity_log').delete().contains('metadata', { via: 'smoke' })
  console.log('[cleanup] done')
  console.log('\nPHASE 3-5 HTTP TEST DONE')
}
main().catch(e => { console.error('TEST FAILED:', e.message ?? e); process.exit(1) })
