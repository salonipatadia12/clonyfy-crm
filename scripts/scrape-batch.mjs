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
const ROTATE = has('rotate')   // use fresh hashtags instead of June's top-3
const TAG_COUNT = Number(flag('tags', 3))
const POSTS_PER_TAG = Number(flag('posts', 120))  // discovery volume per hashtag

const PRICE_ENRICH = 0.001     // $/profile
// Measured against Apify billing 2026-09-02: 360 posts cost $0.56 => $0.00156.
// The old $0.0026 over-estimated by ~1.7x and tripped the spend cap before any
// enrichment could run. Small safety margin kept on top of the measured rate.
const PRICE_POST = 0.0018      // $/discovery post

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


// Second, non-overlapping hashtag set per niche. The first run (June 2026) used
// tags.slice(0,3) of NICHE_HASHTAGS, so re-running that pulls the same post pool
// and burns credit re-enriching handles we already own. --rotate uses these
// instead, plus the two tags the original run never reached (indices 3-4).
const NICHE_HASHTAGS_ALT = {
  online_business: ['digitalmarketer', 'ecommercetips', 'passiveincomeideas', 'onlinebusinesstips', 'businessgrowth'],
  technology: ['technews', 'techtips', 'machinelearning', 'devops', 'cloudcomputing'],
  web_dev: ['javascript', 'nextjs', 'tailwindcss', 'fullstackdeveloper', 'webdesigner'],
  software_dev: ['softwareengineer', 'codinglife', 'developerlife', 'backenddeveloper', '100daysofcode'],
  design: ['productdesign', 'designsystem', 'uxdesigner', 'branding', 'logodesigner'],
  digital_marketing: ['emailmarketing', 'marketingtips', 'ppcadvertising', 'growthmarketing', 'brandstrategy'],
  business_entrepreneurship: ['smallbusinessowner', 'startupfounder', 'businessstrategy', 'femaleentrepreneur', 'ecommerceseller'],
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

// ---- preflight ---------------------------------------------------------------
// Discovery is charged before enrichment ever runs, so a rate-limited profile
// actor used to cost a full budget before the failure surfaced (2026-09-02:
// $4.96 for 1 lead). Probe 3 profiles first — a few tenths of a cent — and
// refuse to start if Instagram is not answering. --skip-preflight to override.
if (!has('skip-preflight')) {
  const probe = ['nasa', 'github', 'figma']
  process.stdout.write('preflight: checking the profile actor is working… ')
  try {
    const items = await callActor(PROFILE_ACTOR, { profiles: probe, resultsLimit: probe.length }, 180000)
    const ok = items.filter(i => i && i.followersCount != null)
    if (!ok.length) {
      const codes = [...new Set(items.map(i => i?.errorCode || i?.httpStatus).filter(Boolean))]
      console.log('FAILED')
      console.log(`\n❌ ${probe.length}/${probe.length} probe profiles returned no data (${codes.join(', ') || 'unknown'}).`)
      console.log('   Instagram is rate-limiting the profile actor — a real run would spend the')
      console.log('   whole budget on failed lookups. Not starting. Try again later.')
      process.exit(2)
    }
    console.log(`ok (${ok.length}/${items.length}, e.g. @${ok[0].username} ${ok[0].followersCount})`)
  } catch (e) {
    console.log('FAILED')
    console.log(`\n❌ preflight call errored: ${String(e.message).slice(0, 160)}`)
    console.log('   Not starting — refusing to spend while the actor is unhealthy.')
    process.exit(2)
  }
}

const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
const workspaceId = ws?.workspace_id
if (!workspaceId) { console.log('❌ no admin workspace found'); process.exit(1) }

const niches = ALL ? Object.keys(NICHE_HASHTAGS) : [ONE_NICHE]
let spent = 0, postsSeen = 0, enriched = 0, kept = 0, inserted = 0
const seen = new Set()

outer: for (const niche of niches) {
  const base = NICHE_HASHTAGS[niche]
  if (!base) { console.log(`skip unknown niche ${niche}`); continue }
  // Rotated pool: the alt set first, then the two originals the first run never used.
  const pool = ROTATE ? [...(NICHE_HASHTAGS_ALT[niche] || []), ...base.slice(3)] : base
  const tags = pool.slice(0, TAG_COUNT)
  if (!tags.length) { console.log(`skip ${niche} — no hashtags in pool`); continue }
  console.log(`\n— niche: ${niche} (#${tags.join(' #')})`)

  // discover handles
  const projDiscover = POSTS_PER_TAG * tags.length * PRICE_POST
  if (spent + projDiscover > MAX_SPEND) { console.log('  reached spend cap before discovery — stopping'); break }
  const posts = await callActor(HASHTAG_ACTOR, { hashtags: tags, resultsType: 'posts', resultsLimit: POSTS_PER_TAG })
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

    // The profile actor bills whether or not Instagram answers. When IG
    // rate-limits, every item comes back as {error, errorCode:'RATE_LIMITED'}
    // with no followersCount — which the filters below silently read as "not a
    // lead", so the run looks like poor yield instead of a broken scrape and
    // burns the whole budget. Abort loudly instead. (2026-09-02: 1,033/1,055
    // rate-limited before this check existed.)
    const failed = items.filter(i => i && i.followersCount == null)
    const failRate = items.length ? failed.length / items.length : 0
    if (failRate > 0.3) {
      const codes = [...new Set(failed.map(i => i.errorCode || i.httpStatus).filter(Boolean))]
      console.log(`\n❌ ABORT: ${failed.length}/${items.length} profiles returned no data (${codes.join(', ') || 'unknown'}).`)
      console.log(`   Instagram is rate-limiting this actor. Nothing useful can be scraped right now —`)
      console.log(`   stopping so the remaining budget is not spent on failed lookups.`)
      console.log(`   Retry later, in smaller batches, or with a residential proxy.`)
      break outer
    }

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
