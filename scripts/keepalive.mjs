// Keeps the Supabase project from idle-pausing.
//
// Free-tier projects pause after ~7 days without API activity and are deleted
// after ~90 days paused. That is exactly how the previous project
// (vyhkitdimdwifhtpiiqm) was lost in 2026. A cheap authenticated read on a
// schedule counts as activity and resets the clock.
//
//   node scripts/keepalive.mjs
//
// Runs weekly in CI via .github/workflows/keepalive.yml. Reads config from the
// environment when present so CI needs no .env.local.
import fs from 'node:fs'
import path from 'node:path'

function config() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }
  }
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) throw new Error('no SUPABASE_URL/ANON_KEY in env and no .env.local')
  const env = Object.fromEntries(fs.readFileSync(p, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
}

const { url, key } = config()
if (!url || !key) { console.error('[keepalive] missing url/key'); process.exit(1) }

// head+count is the cheapest read that still hits Postgres, not just the gateway.
const res = await fetch(`${url}/rest/v1/influencers?select=id&limit=1`, {
  headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' },
  signal: AbortSignal.timeout(20000),
})

if (!res.ok) {
  console.error(`[keepalive] FAILED ${res.status} ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}
console.log(`[keepalive] ok ${res.status} · ${new URL(url).hostname} · ${new Date().toISOString()}`)
