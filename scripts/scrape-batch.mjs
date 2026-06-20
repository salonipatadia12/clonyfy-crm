// Budget-capped Instagram lead scraper — pilot + full runs. Discovers handles by
// niche hashtags, enriches them, applies the same filters as the app (US-only,
// 1k–500k band, design-excludes-fashion), inserts the keepers, and reports yield
// + real $ spent so cost is measurable and never bursts.
//
// PILOT:  node scripts/scrape-batch.mjs --niche web_dev --target 300 --maxSpend 10
// FULL:   node scripts/scrape-batch.mjs --all-niches --target 5000 --maxSpend 50
// DRY:    add --dry to measure yield/cost WITHOUT inserting.
//
// Pricing (from Apify, June 2026): enrich $0.001/profile, discovery $0.0026/post.
// Keep the US/fashion filters in sync with lib/apify.ts.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2)
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : def }
const has = (name) => args.includes(`--${name}`)
const TARGET = Number(flag('target', 300))
const MAX_SPEND = Number(flag('maxSpend', 10))
const COUNTRY = String(flag('country', 'US')).toUpperCase()
const DRY = has('dry')
const ALL = has('all-niches')
const ONE_NICHE = flag('niche', 'web_dev')

const PRICE_ENRICH = 0.001     // $/profile
const PRICE_POST = 0.0026      // $/discovery post

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const TOKEN = env.APIFY_TOKEN
const PROFILE_ACTOR = (env.APIFY_PROFILE_ACTOR || 'figue/instagram-profile-scraper').replace('/', '~')
const HASHTAG_ACTOR = (env.APIFY_HASHTAG_ACTOR || 'apify/instagram-hashtag-scraper').replace('/', '~')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const NICHE_HASHTAGS = {
  online_business: ['onlinebusiness', 'digitalproducts', 'solopreneur', 'onlinecoach', 'makemoneyonline'],
  technology: ['tech', 'saas', 'artificialintelligence', 'aitools', 'techcreator'],
  web_dev: ['webdevelopment', 'webdeveloper', 'frontenddeveloper', 'reactjs', 'webdev'],
  software_dev: ['softwaredeveloper', 'programming', 'pythonprogramming', 'coding', 'programmer'],
  design: ['uiux', 'uidesign', 'graphicdesigner', 'figma', 'webdesign'],
  digital_marketing: ['digitalmarketing', 'socialmediamarketing', 'seotips', 'contentmarketing', 'instagrammarketing'],
  business_entrepreneurship: ['entrepreneur', 'entrepreneurlife', 'businesstips', 'founder', 'businesscoach'],
}

const US_PATTERNS = [/\busa\b/, /united states/, /🇺🇸/, /\bus[- ]?based\b/, /based in the (us|usa|states)/, /\bnyc\b/, /new york/, /los angeles/, /\bl\.?a\.?\b/, /san francisco/, /\bsf\b/, /\bchicago\b/, /\baustin\b/, /\bmiami\b/, /\batlanta\b/, /\btexas\b/, /\bcalifornia\b/, /\bseattle\b/, /\bboston\b/, /\bdallas\b/, /\bhouston\b/, /\bbrooklyn\b/, /\bdenver\b/, /\bphoenix\b/, /\bportland\b/, /\bnashville\b/, /\bsan diego\b/]
const FASHION = [/fashion design/, /fashion brand/, /fashion label/, /fashion house/, /fashion stylist/, /fashion blogger/, /fashion model/, /fashion week/, /fashion photographer/, /haute couture/, /\bcouture\b/, /streetwear/, /menswear/, /womenswear/, /swimwear/, /activewear/, /lingerie/, /\bootd\b/, /clothing brand/, /clothing line/, /apparel brand/, /\brunway\b/, /lookbook/, /\bfashionista\b/, /personal stylist/, /wardrobe stylist/, /\bmilliner/]
const isUS = (p) => { const c = (p.country || '').trim().toUpperCase(); if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return true; const b = (p.biography || '').toLowerCase(); return b ? US_PATTERNS.some(r => r.test(b)) : false }
const isFashion = (p) => { const t = `${p.biography || ''} ${p.full_name || ''}`.toLowerCase(); return t.trim() ? FASHION.some(r => r.test(t)) : false }
const bucketFor = (f) => f == null ? null : f < 1000 ? '<1K' : f < 10000 ? '1K-10K' : f < 50000 ? '10K-50K' : f < 100000 ? '50K-100K' : f < 500000 ? '100K-500K' : '500K+'

async function callActor(actor, input, timeoutMs = 180000) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}`
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${actor} failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`)
  return res.json()
}
async function remaining() {
  try { const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${TOKEN}`); const j = await r.json(); const d = j?.data || {}; const used = d?.current?.monthlyUsageUsd ?? d?.monthlyUsageUsd; const max = d?.limits?.maxMonthlyUsageUsd ?? d?.maxMonthlyUsageUsd; return (typeof used === 'number' && typeof max === 'number') ? Math.max(0, max - used) : null } catch { return null }
}
function normalize(item) {
  const handle = String(item.username || item.handle || '').toLowerCase().replace(/^@/, '')
  if (!handle) return null
  let country = null
  const addr = item.business_address_json || item.businessAddressJson
  if (typeof addr === 'string') { try { country = JSON.parse(addr)?.country_code ?? null } catch {} }
  else if (addr && typeof addr === 'object') country = addr.country_code ?? null
  return { handle, full_name: item.fullName || item.full_name || item.name || null, follower_count: item.followersCount ?? item.followers_count ?? item.followers ?? null, biography: item.biography ?? item.bio ?? null, is_verified: !!(item.verified ?? item.isVerified), country, email: item.business_email || item.public_email || item.email || null, profile_url: `https://www.instagram.com/${handle}/` }
}

// ---- run --------------------------------------------------------------------
const rem0 = await remaining()
console.log(`Apify remaining credit: ${rem0 == null ? 'unknown' : '$' + rem0.toFixed(2)} · spend cap: $${MAX_SPEND} · target: ${TARGET} kept · country: ${COUNTRY}${DRY ? ' · DRY-RUN' : ''}`)
if (rem0 != null && rem0 < 0.05) { console.log('❌ Apify credit exhausted — top up before scraping.'); process.exit(1) }

const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
const workspaceId = ws?.workspace_id
if (!workspaceId) { console.log('❌ no admin workspace found'); process.exit(1) }

const niches = ALL ? Object.keys(NICHE_HASHTAGS) : [ONE_NICHE]
let spent = 0, postsSeen = 0, enriched = 0, kept = 0, inserted = 0
const seen = new Set()

outer: for (const niche of niches) {
  const tags = NICHE_HASHTAGS[niche]
  if (!tags) { console.log(`skip unknown niche ${niche}`); continue }
  console.log(`\n— niche: ${niche} (#${tags.slice(0, 3).join(' #')})`)

  // discover handles
  const projDiscover = 120 * PRICE_POST
  if (spent + projDiscover > MAX_SPEND) { console.log('  reached spend cap before discovery — stopping'); break }
  const posts = await callActor(HASHTAG_ACTOR, { hashtags: tags.slice(0, 3), resultsType: 'posts', resultsLimit: 120 })
  postsSeen += posts.length; spent += posts.length * PRICE_POST
  const handles = [...new Set(posts.map(p => String(p.ownerUsername || p.username || '').toLowerCase().replace(/^@/, '')).filter(Boolean))]
  // drop ones already in catalog
  const { data: exist } = await db.from('influencers').select('handle').eq('workspace_id', workspaceId).in('handle', handles.slice(0, 200))
  const have = new Set((exist ?? []).map(r => r.handle))
  const fresh = handles.filter(h => !have.has(h) && !seen.has(h))
  fresh.forEach(h => seen.add(h))
  console.log(`  discovered ${handles.length} handles, ${fresh.length} fresh`)
  if (!fresh.length) continue

  // enrich in batches of 50, honoring the spend cap
  for (let i = 0; i < fresh.length; i += 50) {
    const batch = fresh.slice(i, i + 50)
    if (spent + batch.length * PRICE_ENRICH > MAX_SPEND) { console.log('  reached spend cap during enrichment — stopping'); break outer }
    const items = await callActor(PROFILE_ACTOR, { profiles: batch, resultsLimit: batch.length })
    enriched += batch.length; spent += batch.length * PRICE_ENRICH
    const profiles = items.map(normalize).filter(Boolean)

    const keepers = profiles.filter(p =>
      (COUNTRY !== 'US' || isUS(p)) &&
      (p.follower_count ?? 0) >= 1000 && (p.follower_count ?? 0) <= 500000 &&
      !(niche === 'design' && isFashion(p)))
    kept += keepers.length

    if (!DRY && keepers.length) {
      const now = new Date().toISOString()
      const rows = keepers.map(p => ({ workspace_id: workspaceId, handle: p.handle, full_name: p.full_name || p.handle, follower_count: p.follower_count, niche, country: COUNTRY === 'US' ? 'US' : (p.country || null), biography: p.biography, profile_url: p.profile_url, is_verified: p.is_verified, email: p.email, scraped_at: now, follower_bucket: bucketFor(p.follower_count) }))
      const { data: ins } = await db.from('influencers').upsert(rows, { onConflict: 'workspace_id,handle', ignoreDuplicates: true }).select('handle')
      inserted += ins?.length ?? 0
    }
    console.log(`  enriched ${enriched} · kept ${kept} · spent ~$${spent.toFixed(2)}`)
    if (kept >= TARGET) { console.log('  reached target'); break outer }
  }
}

// ---- report -----------------------------------------------------------------
const rem1 = await remaining()
const measured = (rem0 != null && rem1 != null) ? (rem0 - rem1) : null
const yieldPct = enriched ? (kept / enriched * 100) : 0
const perLead = kept ? spent / kept : 0
console.log(`\n========== PILOT/RUN SUMMARY ==========`)
console.log(`discovery posts:   ${postsSeen}`)
console.log(`profiles enriched: ${enriched}`)
console.log(`leads kept:        ${kept}  (${DRY ? 'not inserted — dry run' : inserted + ' inserted'})`)
console.log(`yield:             ${yieldPct.toFixed(1)}%  (kept / enriched)`)
console.log(`est. spent:        $${spent.toFixed(2)}${measured != null ? `  (Apify measured: $${measured.toFixed(2)})` : ''}`)
console.log(`cost per lead:     $${perLead.toFixed(3)}`)
console.log(`→ projected for 5,000 leads: ~$${(perLead * 5000).toFixed(0)}`)
console.log(`=======================================`)
