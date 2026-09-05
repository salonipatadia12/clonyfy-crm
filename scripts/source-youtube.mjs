// Free creator sourcing from the YouTube Data API v3 — no Apify, no spend.
//
// Quota: 10,000 units/day free. The economics only work if you respect the
// asymmetry between the two calls:
//
//   search.list    100 units  → 50 results          (expensive — the scarce resource)
//   channels.list    1 unit   → up to 50 channels   (cheap — enrichment is ~free)
//
// So: discover with as few search calls as possible, then enrich in batches of
// 50. A day's quota is ~95 searches (~4,750 candidate channels) with enrichment
// costing almost nothing.
//
// Unlike Instagram, channels.list returns snippet.country — a real ISO country
// code — which is the whole reason this route exists.
//
// Setup: create an API key at https://console.cloud.google.com/apis/credentials
// (enable "YouTube Data API v3"), then add to .env.local:
//   YOUTUBE_API_KEY=...
//
//   node scripts/source-youtube.mjs --dry
//   node scripts/source-youtube.mjs --niche technology --pages 2
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const has = n => args.includes(`--${n}`)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

const DRY = has('dry')
const MIN_SUBS = Number(flag('min', 1000))
const MAX_SUBS = Number(flag('max', 500000))
const ONE_NICHE = flag('niche')
const PAGES = Number(flag('pages', 2))          // search pages per query; each costs 100 units
const QUOTA_CAP = Number(flag('quota', 9000))   // stay under the 10k daily ceiling

// Search terms per niche. YouTube covers all 7 niches, unlike GitHub.
const NICHE_QUERIES = {
  online_business: ['online business tips', 'digital products passive income', 'solopreneur'],
  technology: ['tech reviews developer', 'AI tools tutorial', 'software engineering career'],
  web_dev: ['web development tutorial', 'react tutorial', 'frontend developer'],
  software_dev: ['python programming tutorial', 'coding interview', 'software developer vlog'],
  design: ['ui ux design tutorial', 'graphic design tips', 'figma tutorial'],
  digital_marketing: ['digital marketing strategy', 'seo tutorial', 'social media marketing'],
  business_entrepreneurship: ['startup founder advice', 'small business tips', 'entrepreneur mindset'],
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const KEY = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY
if (!KEY) {
  console.error('❌ YOUTUBE_API_KEY missing from .env.local')
  console.error('   Create one at https://console.cloud.google.com/apis/credentials')
  console.error('   (enable "YouTube Data API v3" for the project first), then add:')
  console.error('   YOUTUBE_API_KEY=...')
  process.exit(1)
}

let quotaUsed = 0
const api = async (endpoint, params, cost) => {
  if (quotaUsed + cost > QUOTA_CAP) throw new Error('QUOTA_CAP reached')
  const qs = new URLSearchParams({ ...params, key: KEY })
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`)
  quotaUsed += cost
  if (!r.ok) {
    const body = await r.text()
    if (/quotaExceeded/.test(body)) throw new Error('QUOTA_EXCEEDED — resets at midnight Pacific')
    throw new Error(`${endpoint} → ${r.status} ${body.slice(0, 160)}`)
  }
  return r.json()
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
if (!ws) { console.error('no admin workspace'); process.exit(1) }
const workspaceId = ws.workspace_id

const { data: existing } = await db.from('influencers').select('handle').eq('workspace_id', workspaceId).eq('platform', 'youtube')
const have = new Set((existing ?? []).map(r => r.handle.toLowerCase()))

console.log(`YouTube sourcing · band ${MIN_SUBS}-${MAX_SUBS} subs · US only${DRY ? ' · DRY-RUN' : ''}`)
console.log(`quota cap ${QUOTA_CAP} units · already have ${have.size} youtube rows\n`)

const bucketFor = f => f == null ? null : f < 1000 ? '<1K' : f < 10000 ? '1K-10K' : f < 50000 ? '10K-50K' : f < 100000 ? '50K-100K' : f < 500000 ? '100K-500K' : '500K+'
const niches = ONE_NICHE ? [ONE_NICHE] : Object.keys(NICHE_QUERIES)
let discovered = 0, kept = 0, inserted = 0

try {
  for (const niche of niches) {
    const queries = NICHE_QUERIES[niche]
    if (!queries) { console.log(`skip unknown niche ${niche}`); continue }
    console.log(`— ${niche}`)

    // 1. Discover channel ids (expensive: 100 units per page).
    const ids = new Set()
    for (const q of queries) {
      let pageToken
      for (let p = 0; p < PAGES; p++) {
        const res = await api('search', {
          part: 'snippet', q, type: 'channel', maxResults: '50',
          regionCode: 'US', relevanceLanguage: 'en',
          ...(pageToken ? { pageToken } : {}),
        }, 100)
        for (const it of res.items || []) {
          const id = it.snippet?.channelId || it.id?.channelId
          if (id) ids.add(id)
        }
        pageToken = res.nextPageToken
        if (!pageToken) break
      }
    }
    discovered += ids.size
    console.log(`  discovered ${ids.size} channels (quota used ${quotaUsed})`)

    // 2. Enrich in batches of 50 (cheap: 1 unit per batch).
    const rows = []
    const all = [...ids]
    // Drop-off diagnostics — a steep funnel should be explainable, not guessed at.
    const drop = { no_country: 0, non_us: 0, below_band: 0, above_band: 0, hidden_subs: 0, already_have: 0 }
    for (let i = 0; i < all.length; i += 50) {
      const res = await api('channels', {
        part: 'snippet,statistics', id: all.slice(i, i + 50).join(','), maxResults: '50',
      }, 1)
      for (const ch of res.items || []) {
        const subs = Number(ch.statistics?.subscriberCount ?? 0)
        const country = ch.snippet?.country || null
        const handle = (ch.snippet?.customUrl || ch.id).replace(/^@/, '')
        if (have.has(handle.toLowerCase())) { drop.already_have++; continue }
        if (!country) { drop.no_country++; continue }
        if (country !== 'US') { drop.non_us++; continue }  // the real country filter
        if (ch.statistics?.hiddenSubscriberCount) { drop.hidden_subs++; continue }
        if (subs < MIN_SUBS) { drop.below_band++; continue }
        if (subs > MAX_SUBS) { drop.above_band++; continue }

        rows.push({
          workspace_id: workspaceId,
          platform: 'youtube',
          handle,
          external_id: ch.id,
          full_name: ch.snippet?.title || handle,
          follower_count: subs,
          follower_bucket: bucketFor(subs),
          niche,
          country: 'US',
          location: country,
          biography: (ch.snippet?.description || '').slice(0, 2000),
          profile_url: `https://www.youtube.com/channel/${ch.id}`,
          is_verified: false,
          source: 'youtube:search',
          scraped_at: new Date().toISOString(),
        })
      }
    }
    kept += rows.length
    console.log(`  US + in-band ${rows.length} (quota used ${quotaUsed})`)
    console.log(`    dropped: ${Object.entries(drop).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ') || 'none'}`)

    if (!DRY && rows.length) {
      const { data: ins, error } = await db.from('influencers')
        .upsert(rows, { onConflict: 'workspace_id,platform,handle', ignoreDuplicates: true }).select('handle')
      if (error) console.log(`  insert error: ${error.message}`)
      else { inserted += ins?.length ?? 0; console.log(`  inserted ${ins?.length ?? 0}`) }
    }
  }
} catch (e) {
  console.log(`\nstopped: ${e.message}`)
}

console.log(`\n========== YOUTUBE SOURCING ==========`)
console.log(`channels discovered : ${discovered}`)
console.log(`US + in-band        : ${kept}`)
console.log(`inserted            : ${DRY ? '(dry run)' : inserted}`)
console.log(`quota used          : ${quotaUsed} / 10000 daily`)
console.log(`cost                : $0.00`)
console.log(`======================================`)
