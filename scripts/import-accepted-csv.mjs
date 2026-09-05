// Imports an externally-produced creator CSV (accepted_creators.csv) into the
// catalog.
//
//   node scripts/import-accepted-csv.mjs ../accepted_creators.csv --dry
//   node scripts/import-accepted-csv.mjs ../accepted_creators.csv
//
// Notes on the mapping decisions:
//
//  * country is set to 'US' ONLY for US_CONFIRMED / US_LIKELY rows. Rows with
//    geo_status UNKNOWN are imported with country = null, NOT 'US'. Tagging
//    unverified rows as US is the exact defect that made the old catalog
//    untrustworthy (its `country` column held a language code).
//  * geo_status is kept in `location` so the confidence is auditable later.
//  * geo_score is deliberately NOT stored — a numeric score column edges toward
//    the `quality_tier` the spec forbids (LOGIC_AND_FLOWS §2).
//  * engagement / account type / quality are not present and not invented.
import fs from 'node:fs'
import Papa from 'papaparse'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const DRY = args.includes('--dry')
if (!file || !fs.existsSync(file)) { console.error('usage: node scripts/import-accepted-csv.mjs <file.csv> [--dry]'); process.exit(1) }

const MIN_FOLLOWERS = 1000
const MAX_FOLLOWERS = 500000

// The CSV uses display-case niche names; the catalog uses the spec's slugs.
const NICHE_MAP = {
  'design': 'design',
  'technology': 'technology',
  'web development': 'web_dev',
  'software development': 'software_dev',
  'digital marketing': 'digital_marketing',
  'business & entrepreneurship': 'business_entrepreneurship',
  'online business': 'online_business',
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
if (!ws) { console.error('no admin workspace'); process.exit(1) }
const workspaceId = ws.workspace_id

const parsed = Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true })
const rows = parsed.data.filter(r => r.username)
console.log(`parsed ${rows.length} rows from ${file}${DRY ? ' · DRY-RUN' : ''}`)

const bucketFor = f => f == null ? null : f < 1000 ? '<1K' : f < 10000 ? '1K-10K' : f < 50000 ? '10K-50K' : f < 100000 ? '50K-100K' : f < 500000 ? '100K-500K' : '500K+'
const num = v => { const n = parseInt(String(v ?? '').replace(/[, ]/g, ''), 10); return Number.isFinite(n) ? n : null }

const skip = { no_handle: 0, bad_niche: 0, out_of_band: 0, dupe_in_file: 0 }
const seen = new Set()
const out = []

for (const r of rows) {
  const handle = String(r.username || '').trim().toLowerCase().replace(/^@/, '')
  if (!handle) { skip.no_handle++; continue }
  if (seen.has(handle)) { skip.dupe_in_file++; continue }
  seen.add(handle)

  const niche = NICHE_MAP[String(r.niche || '').trim().toLowerCase()]
  if (!niche) { skip.bad_niche++; continue }

  const followers = num(r.followers)
  if (followers == null || followers < MIN_FOLLOWERS || followers > MAX_FOLLOWERS) { skip.out_of_band++; continue }

  const geo = String(r.geo_status || 'UNKNOWN').trim().toUpperCase()
  const isUS = geo === 'US_CONFIRMED' || geo === 'US_LIKELY'

  out.push({
    workspace_id: workspaceId,
    platform: 'instagram',
    handle,
    full_name: (r.full_name || '').trim() || handle,
    follower_count: followers,
    follower_bucket: bucketFor(followers),
    niche,
    country: isUS ? 'US' : null,        // never fabricate US for UNKNOWN rows
    location: geo,                      // keeps the confidence auditable
    biography: (r.biography || '').trim() || null,
    profile_url: (r.instagram_url || `https://www.instagram.com/${handle}/`).trim(),
    is_verified: false,
    source: `accepted_csv:${String(r.source_query || '').split(':')[0] || 'unknown'}`,
    scraped_at: (r.enriched_at || new Date().toISOString()).trim(),
  })
}

const geoCounts = out.reduce((a, r) => { a[r.location] = (a[r.location] || 0) + 1; return a }, {})
console.log(`\nto import: ${out.length}`)
console.log(`  skipped : ${Object.entries(skip).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ') || 'none'}`)
console.log(`  geo     : ${JSON.stringify(geoCounts)}`)
console.log(`  tagged US: ${out.filter(r => r.country === 'US').length} · country left null: ${out.filter(r => !r.country).length}`)
console.log(`  niches  : ${JSON.stringify(out.reduce((a, r) => { a[r.niche] = (a[r.niche] || 0) + 1; return a }, {}))}`)

if (DRY) { console.log('\n(dry run — nothing written)'); process.exit(0) }

let inserted = 0
for (let i = 0; i < out.length; i += 500) {
  const { data, error } = await db.from('influencers')
    .upsert(out.slice(i, i + 500), { onConflict: 'workspace_id,platform,handle', ignoreDuplicates: true })
    .select('handle')
  if (error) { console.log(`  batch ${i} error: ${error.message}`); continue }
  inserted += data?.length ?? 0
}
console.log(`\ninserted ${inserted} creators`)
