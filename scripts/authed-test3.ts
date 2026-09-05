// Strategic features: comments/@mentions, goals, link-based invites, Apify.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'; import path from 'node:path'

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2] }
  return out
}
const REF = 'vyhkitdimdwifhtpiiqm', CHUNK = 3180, BASE = 'http://localhost:3000'
function cookieHeader(s: unknown): string {
  const v = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64'); const n = `sb-${REF}-auth-token`
  if (v.length <= CHUNK) return `${n}=${v}`
  const p: string[] = []; for (let i = 0, x = 0; i < v.length; i += CHUNK, x++) p.push(`${n}.${x}=${v.slice(i, i + CHUNK)}`); return p.join('; ')
}

async function main() {
  const env = readEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const [email, password] = process.argv.slice(2)
  if (!email || !password) { console.error('usage: tsx scripts/authed-test3.ts <email> <password>'); process.exit(1) }
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  const cookie = cookieHeader(data.session)
  const J = (m: string, p: string, b?: unknown) => fetch(BASE + p, { method: m, headers: { cookie, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, b: await r.json().catch(() => null) }))
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // pick a catalog handle
  const inf = await J('GET', '/api/influencers?pageSize=1')
  const handle = inf.b.rows[0].handle

  // 1. invite (link-based) + goal
  const testEmail = `member.${Date.now()}@clonyfy.test`
  const inv = await J('POST', '/api/members', { name: 'Goal Rep', email: testEmail, role: 'member' })
  console.log('[invite] link present:', !!inv.b?.inviteLink, '| temp pw fallback:', !!inv.b?.tempPassword)
  const memberId = inv.b.userId
  const goal = await J('PATCH', `/api/members/${memberId}`, { monthly_goal: 20 })
  console.log('[set goal]', goal.s)
  const an = await J('GET', '/api/analytics')
  const m = (an.b?.members ?? []).find((x: { id: string }) => x.id === memberId)
  console.log('[analytics goal] member monthly_goal=', m?.monthly_goal, 'advancedThisMonth=', m?.advancedThisMonth)

  // 2. comments + @mention notification
  const cm = await J('POST', '/api/comments', { handle, body: `@goal great fit, lets reach out to @${handle}` })
  console.log('[comment]', cm.s, 'mentions=', JSON.stringify(cm.b?.comment?.mentions?.length ?? 0))
  const cl = await J('GET', `/api/comments?handle=${handle}`)
  console.log('[comments list]', cl.s, 'count=', cl.b?.comments?.length)
  if (cm.b?.comment?.id) await J('DELETE', `/api/comments/${cm.b.comment.id}`)

  // 3. Apify status
  const st = await J('GET', '/api/discover')
  console.log('[apify status] enabled=', st.b?.enabled, 'remainingUsd=', st.b?.remainingUsd)

  // 4. Apify enrich (tiny, ~$0.001): Add Creator with enrich on a known handle
  const enrich = await J('POST', '/api/influencers/add', { handle: 'nasa', enrich: true })
  console.log('[apify enrich] status=', enrich.s, 'followers=', enrich.b?.influencer?.follower_count, 'name=', enrich.b?.influencer?.full_name)

  // cleanup
  await J('DELETE', `/api/members/${memberId}`)
  await admin.from('influencers').delete().eq('handle', 'nasa').eq('workspace_id', m ? m.id : '').neq('handle', '')
  await admin.from('influencers').delete().eq('handle', 'nasa')
  await admin.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await admin.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('\nSTRATEGIC TEST DONE')
}
main().catch(e => { console.error('FAILED:', e.message ?? e); process.exit(1) })
