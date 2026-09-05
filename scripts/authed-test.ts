// Verifies the authenticated HTTP path: sign in, build the @supabase/ssr session
// cookie, and call the real API routes against the running dev server.
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

const REF = 'vyhkitdimdwifhtpiiqm'
const CHUNK = 3180

function cookieHeader(session: unknown): string {
  // @supabase/ssr stores the session as `base64-<base64(JSON)>`, chunked if long.
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const name = `sb-${REF}-auth-token`
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts: string[] = []
  for (let i = 0, idx = 0; i < value.length; i += CHUNK, idx++) {
    parts.push(`${name}.${idx}=${value.slice(i, i + CHUNK)}`)
  }
  return parts.join('; ')
}

async function main() {
  const env = readEnv()
  const [email, password] = process.argv.slice(2)
  if (!email || !password) { console.error('usage: tsx scripts/authed-test.ts <email> <password>'); process.exit(1) }
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error('sign-in failed: ' + error?.message)
  console.log('signed in as', data.user?.email)

  const cookie = cookieHeader(data.session)
  const base = 'http://localhost:3000'
  const call = async (p: string) => {
    const res = await fetch(base + p, { headers: { cookie } })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  }

  const stats = await call('/api/stats')
  console.log('[stats]', stats.status, stats.body?.kpis ? `profiles=${stats.body.kpis.totalProfiles} inPipeline=${stats.body.kpis.inPipeline} contacted=${stats.body.kpis.contacted} team=${stats.body.kpis.teamMembers}` : JSON.stringify(stats.body))

  const inf = await call('/api/influencers?pageSize=3&niche=web_dev&sort=follower_count&order=desc')
  console.log('[influencers] web_dev', inf.status, 'total=' + inf.body?.total, 'top=' + (inf.body?.rows ?? []).map((r: { handle: string }) => r.handle).join(','))

  const facets = await call('/api/facets')
  console.log('[facets]', facets.status, 'niches=' + (facets.body?.niche ?? []).length, 'countries=' + (facets.body?.country ?? []).length)

  const analytics = await call('/api/analytics')
  console.log('[analytics]', analytics.status, 'members=' + (analytics.body?.members?.length ?? 'n/a'), 'reachByNiche=' + (analytics.body?.reachByNiche?.length ?? 0))

  // mutate: add to pipeline, confirm stats reflect it, then read pipeline
  const top = inf.body?.rows?.[0]
  if (top) {
    const add = await fetch(base + '/api/pipeline/add', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ handles: [top.handle] }) })
    const addBody = await add.json()
    console.log('[add to pipeline]', add.status, JSON.stringify(addBody))
    const pipe = await call('/api/pipeline')
    console.log('[pipeline] rows=' + (pipe.body?.rows ?? []).length)
    // cleanup the added row
    const row = (pipe.body?.rows ?? []).find((r: { handle: string }) => r.handle === top.handle)
    if (row) {
      const del = await fetch(base + `/api/pipeline/${row.id}`, { method: 'DELETE', headers: { cookie } })
      console.log('[cleanup delete]', del.status)
    }
  }
  console.log('\nAUTHED HTTP TEST DONE')
}

main().catch(e => { console.error('AUTHED TEST FAILED:', e.message ?? e); process.exit(1) })
