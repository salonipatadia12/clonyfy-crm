// Exports the live influencer catalog to CSV.
//   node scripts/export-csv.mjs [--out path.csv]
// Formula-injection guarded (leading = + - @ are prefixed with ') so the file is
// safe to open in Excel/Sheets.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const COLS = ['platform', 'handle', 'full_name', 'follower_count', 'follower_bucket', 'niche', 'country',
  'location', 'is_verified', 'email', 'biography', 'bio_link', 'profile_url', 'source', 'hidden', 'scraped_at']
const PLATFORM = flag('platform')   // optional: instagram | github | youtube | …

const cell = (v) => {
  if (v == null) return ''
  let s = String(v).replace(/\r?\n/g, ' ').trim()
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`          // formula-injection guard
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

let rows = [], from = 0
for (;;) {
  let q = db.from('influencers').select(COLS.join(','))
  if (PLATFORM) q = q.eq('platform', PLATFORM)
  const { data, error } = await q
    .order('follower_count', { ascending: false, nullsFirst: false }).range(from, from + 999)
  if (error) throw new Error(error.message)
  rows = rows.concat(data)
  if (data.length < 1000) break
  from += 1000
}

const out = flag('out', `clonyfy-influencers-${new Date().toISOString().slice(0, 10)}.csv`)
fs.writeFileSync(out, [COLS.join(','), ...rows.map(r => COLS.map(c => cell(r[c])).join(','))].join('\n') + '\n')
console.log(`exported ${rows.length} influencers -> ${out}`)
