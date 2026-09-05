// Free creator sourcing from the GitHub REST API — no Apify, no spend.
//
// Why GitHub: it is the only source we found that lets us filter by real
// geography AND follower count in the query itself. Instagram exposes no
// country at all (see SCRAPING_RESEARCH.md), which is what made the paid
// Instagram funnel produce ~0 usable US leads.
//
//   node scripts/source-github.mjs --dry              # preview, writes nothing
//   node scripts/source-github.mjs                    # insert into the catalog
//   node scripts/source-github.mjs --min 500 --max 200000
//   node scripts/source-github.mjs --niche web_dev
//
// Auth: uses `gh auth token` (already logged in on this machine). Limits are
// 30 searches/min and 5,000 core requests/hour — both respected below.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const has = n => args.includes(`--${n}`)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

const DRY = has('dry')
const MIN_FOLLOWERS = Number(flag('min', 1000))
const MAX_FOLLOWERS = Number(flag('max', 500000))
const ONE_NICHE = flag('niche')
const PER_QUERY_CAP = Number(flag('cap', 300))   // GitHub hard-caps search at 1000

// GitHub is strong for the engineering niches and weak for the rest — design,
// marketing and business creators are not on GitHub in any volume. Sourcing
// those needs YouTube/Bluesky instead, so we do not pretend to cover them here.
const NICHE_QUERIES = {
  web_dev: ['language:javascript', 'language:typescript', 'topic:react', 'topic:vue', 'topic:nextjs'],
  software_dev: ['language:python', 'language:go', 'language:rust', 'language:java', 'language:swift'],
  technology: ['topic:machine-learning', 'topic:artificial-intelligence', 'topic:devops', 'topic:kubernetes'],
}

// GitHub `location` is free text, so the query-side filter is a net and the
// regex below is the sieve. Deliberately strict: a false US tag is worse than a
// missed creator, because the whole point of this route is trustworthy geography.
const US_LOCATION_QUERIES = ['USA', '"United States"', 'California', '"New York"', 'Texas', 'Seattle', 'Austin', 'Chicago', 'Boston']
const US_STATES = ['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming']
const US_ABBR = ['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc']
const US_CITIES = ['nyc','new york','brooklyn','los angeles','san francisco','bay area','silicon valley','seattle','austin','chicago','boston','denver','atlanta','miami','portland','nashville','san diego','dallas','houston','phoenix','philadelphia','pittsburgh','minneapolis','detroit','salt lake city','raleigh','charlotte','washington dc']

function isUS(location) {
  if (!location) return false
  const s = location.toLowerCase().trim()
  // Explicit non-US country names that contain a US-looking token.
  if (/\b(canada|australia|india|brazil|mexico|uk|united kingdom|england)\b/.test(s)) return false
  if (/\b(usa|u\.s\.a|united states|u\.s\.)\b/.test(s)) return true
  if (US_CITIES.some(c => s.includes(c))) return true
  if (US_STATES.some(st => new RegExp(`\\b${st}\\b`).test(s))) return true
  // Two-letter state codes only when they look like "Austin, TX".
  const m = s.match(/,\s*([a-z]{2})\b/)
  if (m && US_ABBR.includes(m[1])) return true
  return false
}

const TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim()
const GH = async (path) => {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'clonyfy-sourcing' },
  })
  if (r.status === 403 || r.status === 429) {
    const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000
    const waitMs = Math.max(2000, reset - Date.now() + 1000)
    console.log(`  rate limited — waiting ${Math.round(waitMs / 1000)}s`)
    await sleep(Math.min(waitMs, 90000))
    return GH(path)
  }
  if (!r.ok) throw new Error(`GitHub ${path} → ${r.status} ${(await r.text()).slice(0, 120)}`)
  return r.json()
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
if (!ws) { console.error('no admin workspace'); process.exit(1) }
const workspaceId = ws.workspace_id

const { data: existing } = await db.from('influencers').select('handle').eq('workspace_id', workspaceId).eq('platform', 'github')
const have = new Set((existing ?? []).map(r => r.handle.toLowerCase()))
console.log(`GitHub sourcing · band ${MIN_FOLLOWERS}-${MAX_FOLLOWERS} followers · US only${DRY ? ' · DRY-RUN' : ''}`)
console.log(`already in catalog (github): ${have.size}\n`)

const niches = ONE_NICHE ? [ONE_NICHE] : Object.keys(NICHE_QUERIES)
const seen = new Set()
let found = 0, kept = 0, inserted = 0, searches = 0

const bucketFor = f => f == null ? null : f < 1000 ? '<1K' : f < 10000 ? '1K-10K' : f < 50000 ? '10K-50K' : f < 100000 ? '50K-100K' : f < 500000 ? '100K-500K' : '500K+'

for (const niche of niches) {
  const queries = NICHE_QUERIES[niche]
  if (!queries) { console.log(`skip unknown niche ${niche}`); continue }
  console.log(`— ${niche}`)
  const rows = []

  for (const q of queries) {
    for (const loc of US_LOCATION_QUERIES) {
      if (rows.length >= PER_QUERY_CAP) break
      const search = `${q}+location:${loc}+followers:${MIN_FOLLOWERS}..${MAX_FOLLOWERS}`
      let page = 1
      for (;;) {
        if (rows.length >= PER_QUERY_CAP) break
        let res
        try { res = await GH(`/search/users?q=${encodeURIComponent(search).replace(/%2B/g, '+')}&per_page=100&page=${page}`) }
        catch (e) { console.log(`  query failed: ${String(e.message).slice(0, 80)}`); break }
        searches++
        await sleep(2100)   // 30 searches/min ceiling

        const items = res.items || []
        for (const it of items) {
          const login = it.login.toLowerCase()
          if (seen.has(login) || have.has(login)) continue
          seen.add(login)
          found++

          let u
          try { u = await GH(`/users/${it.login}`) } catch { continue }
          if (!isUS(u.location)) continue
          if ((u.followers ?? 0) < MIN_FOLLOWERS || (u.followers ?? 0) > MAX_FOLLOWERS) continue
          if (u.type !== 'User') continue   // skip Organizations

          kept++
          rows.push({
            workspace_id: workspaceId,
            platform: 'github',
            handle: u.login,
            external_id: String(u.id),
            full_name: u.name || u.login,
            follower_count: u.followers,
            follower_bucket: bucketFor(u.followers),
            niche,
            country: 'US',
            location: u.location,
            biography: u.bio,
            bio_link: u.blog || null,
            profile_url: u.html_url,
            email: u.email || null,
            is_verified: false,
            source: `github:${q}`,
            scraped_at: new Date().toISOString(),
          })
        }
        if (items.length < 100 || page >= 10) break
        page++
      }
    }
  }

  console.log(`  candidates seen ${found} · US + in-band ${rows.length}`)
  if (!DRY && rows.length) {
    const { data: ins, error } = await db.from('influencers')
      .upsert(rows, { onConflict: 'workspace_id,platform,handle', ignoreDuplicates: true }).select('handle')
    if (error) console.log(`  insert error: ${error.message}`)
    else { inserted += ins?.length ?? 0; console.log(`  inserted ${ins?.length ?? 0}`) }
  }
}

console.log(`\n========== GITHUB SOURCING ==========`)
console.log(`searches run    : ${searches}`)
console.log(`candidates seen : ${found}`)
console.log(`US + in-band    : ${kept}`)
console.log(`inserted        : ${DRY ? '(dry run)' : inserted}`)
console.log(`cost            : $0.00`)
console.log(`=====================================`)
