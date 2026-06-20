import 'server-only'

// Server-side Apify integration for scrape-on-demand: discover new creators by
// niche hashtags and enrich handles with real follower counts / bio / country.
// All calls are best-effort and budget-guarded.

const TOKEN = process.env.APIFY_TOKEN
const PROFILE_ACTOR = (process.env.APIFY_PROFILE_ACTOR || 'figue/instagram-profile-scraper').replace('/', '~')
const HASHTAG_ACTOR = (process.env.APIFY_HASHTAG_ACTOR || 'apify/instagram-hashtag-scraper').replace('/', '~')

export const apifyEnabled = () => !!TOKEN

// Niche → discovery hashtags (mirrors the scraper's niches.yaml).
export const NICHE_HASHTAGS: Record<string, string[]> = {
  online_business: ['onlinebusiness', 'digitalproducts', 'solopreneur', 'onlinecoach', 'makemoneyonline'],
  technology: ['tech', 'saas', 'artificialintelligence', 'aitools', 'techcreator'],
  web_dev: ['webdevelopment', 'webdeveloper', 'frontenddeveloper', 'reactjs', 'webdev'],
  software_dev: ['softwaredeveloper', 'programming', 'pythonprogramming', 'coding', 'programmer'],
  design: ['uiux', 'uidesign', 'graphicdesigner', 'figma', 'webdesign'],
  digital_marketing: ['digitalmarketing', 'socialmediamarketing', 'seotips', 'contentmarketing', 'instagrammarketing'],
  business_entrepreneurship: ['entrepreneur', 'entrepreneurlife', 'businesstips', 'founder', 'businesscoach'],
}

async function callActor<T = Record<string, unknown>>(actor: string, input: unknown, timeoutMs = 120_000): Promise<T[]> {
  if (!TOKEN) throw new Error('Apify not configured')
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify actor ${actor} failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

// Returns remaining monthly Apify credit in USD (null if unknown).
export async function remainingBudgetUsd(): Promise<number | null> {
  if (!TOKEN) return null
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me/limits?token=${TOKEN}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const j = await res.json()
    const used = j?.data?.current?.monthlyUsageUsd ?? j?.data?.monthlyUsageUsd
    const max = j?.data?.limits?.maxMonthlyUsageUsd ?? j?.data?.maxMonthlyUsageUsd
    if (typeof used === 'number' && typeof max === 'number') return Math.max(0, max - used)
    return null
  } catch { return null }
}

async function guardBudget() {
  const remaining = await remainingBudgetUsd()
  if (remaining != null && remaining < 0.01) throw new Error('Apify monthly budget exhausted — top up credit to scrape')
}

export interface EnrichedProfile {
  handle: string
  full_name: string | null
  follower_count: number | null
  biography: string | null
  is_verified: boolean
  country: string | null
  email: string | null
  profile_url: string
}

function pickCountry(item: Record<string, unknown>): string | null {
  const addr = item.business_address_json || item.businessAddressJson
  if (typeof addr === 'string') { try { const a = JSON.parse(addr); return a?.country_code || a?.city_name || null } catch { /* */ } }
  if (addr && typeof addr === 'object') return ((addr as Record<string, unknown>).country_code as string) || null
  return null
}

function normalizeProfile(item: Record<string, unknown>): EnrichedProfile | null {
  const handle = String(item.username || item.handle || '').toLowerCase().replace(/^@/, '')
  if (!handle) return null
  return {
    handle,
    full_name: (item.fullName || item.full_name || item.name || null) as string | null,
    follower_count: (item.followersCount ?? item.followers_count ?? item.followers ?? null) as number | null,
    biography: (item.biography ?? item.bio ?? null) as string | null,
    is_verified: !!(item.verified ?? item.isVerified ?? item.is_verified),
    country: pickCountry(item),
    email: (item.business_email || item.public_email || item.email || null) as string | null,
    profile_url: `https://www.instagram.com/${handle}/`,
  }
}

// US targeting — Instagram's hashtag scraper has no country param, so we filter
// after enrichment. A creator counts as US if their (Professional-account)
// business address is US, OR their bio names a US location. Balanced coverage.
const US_PATTERNS: RegExp[] = [
  /\busa\b/, /united states/, /🇺🇸/, /\bus[- ]?based\b/, /based in the (us|usa|states)/,
  /\bnyc\b/, /new york/, /los angeles/, /\bl\.?a\.?\b/, /san francisco/, /\bsf\b/, /\bchicago\b/, /\baustin\b/,
  /\bmiami\b/, /\batlanta\b/, /\btexas\b/, /\bcalifornia\b/, /\bseattle\b/, /\bboston\b/, /\bdallas\b/,
  /\bhouston\b/, /\bbrooklyn\b/, /\bdenver\b/, /\bphoenix\b/, /\bportland\b/, /\bnashville\b/, /\bsan diego\b/,
]
export function isLikelyUS(p: EnrichedProfile): boolean {
  const c = (p.country || '').trim().toUpperCase()
  if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return true
  const bio = (p.biography || '').toLowerCase()
  return bio ? US_PATTERNS.some(re => re.test(bio)) : false
}

// "design" niche means digital/UI/UX/graphic/product design — NOT fashion. Drop
// creators whose bio/name reads as fashion (the scraper otherwise pulls couture
// houses, stylists, models). Applied only to the design niche.
// High-precision fashion signals — require fashion *context* so we don't catch
// "boutique design studio", CSS "styling", 3-D "model", or design-inspiration
// pages that merely list "fashion" among many topics.
const FASHION_PATTERNS: RegExp[] = [
  /fashion design/, /fashion brand/, /fashion label/, /fashion house/, /fashion stylist/,
  /fashion blogger/, /fashion model/, /fashion week/, /fashion photographer/, /haute couture/,
  /\bcouture\b/, /streetwear/, /menswear/, /womenswear/, /swimwear/, /activewear/, /lingerie/,
  /\bootd\b/, /clothing brand/, /clothing line/, /apparel brand/, /\brunway\b/, /lookbook/,
  /\bfashionista\b/, /personal stylist/, /wardrobe stylist/, /\bmilliner/,
]
export function isFashion(p: EnrichedProfile): boolean {
  const text = `${p.biography || ''} ${p.full_name || ''}`.toLowerCase()
  return text ? FASHION_PATTERNS.some(re => re.test(text)) : false
}

export async function enrichProfiles(handles: string[]): Promise<EnrichedProfile[]> {
  const clean = [...new Set(handles.map(h => h.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean)
  if (!clean.length) return []
  await guardBudget()
  const items = await callActor(PROFILE_ACTOR, { profiles: clean, resultsLimit: clean.length })
  return items.map(normalizeProfile).filter((p): p is EnrichedProfile => !!p)
}

// Discover creator handles posting under a niche's hashtags.
export async function discoverHandles(niche: string, count = 30): Promise<string[]> {
  const tags = NICHE_HASHTAGS[niche]
  if (!tags) throw new Error(`unknown niche: ${niche}`)
  await guardBudget()
  const items = await callActor(HASHTAG_ACTOR, {
    hashtags: tags.slice(0, 3),
    resultsType: 'posts',
    resultsLimit: Math.min(count * 3, 200),
  }, 180_000)
  const seen = new Set<string>()
  for (const it of items) {
    const owner = String((it as Record<string, unknown>).ownerUsername || (it as Record<string, unknown>).username || '').toLowerCase().replace(/^@/, '')
    if (owner) seen.add(owner)
    if (seen.size >= count) break
  }
  return [...seen]
}
