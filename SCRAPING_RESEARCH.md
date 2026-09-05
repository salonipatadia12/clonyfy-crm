# Influencer sourcing — research findings (2026-09-02)

Written after the failed $4.96 scrape run. Everything below was tested against
live Apify with real spend ($0.26 total for this research), not taken from docs.

## 1. The enrichment actor was the problem — fixed

`figue/instagram-profile-scraper` (1,175 users) returned
`{errorCode: 'RATE_LIMITED', httpStatus: 401}` for **1,033 of 1,055** profiles,
and Apify bills for those failures ($0.0011/result + $0.0025/run start).

`apify/instagram-profile-scraper` (208,212 users) — the official actor —
returned **10/10 and then 99/100** on the same handles, minutes later. So
Instagram was never rate-limiting us globally; the low-adoption actor was
failing and we paid for every failure.

| | figue | apify (official) |
|---|---|---|
| Users | 1,175 | 208,212 |
| Success on our handles | ~2% | **99%** |
| Cost/profile | $0.0011 | $0.0023 |

2.3x the unit price, but the only one that returns data. **Switch to it.**

Bonus: richer fields — `isBusinessAccount`, `businessCategoryName`, `verified`,
`postsCount`, `externalUrl`, `relatedProfiles`.

**Lesson: prefer high-adoption official actors. A low-user actor that silently
bills for errors is worse than no actor.**

## 2. The real blocker is US targeting, not enrichment

Measured on 100 freshly discovered handles, enriched successfully:

| Stage | Count |
|---|---|
| Enriched OK | 99 / 100 |
| In 1k–500k follower band | **24** |
| ...and passing the US bio filter | **0** |

Two independent problems:

**(a) Hashtag discovery surfaces mostly nano accounts.** 75 of 99 were under
1,000 followers. Hashtag feeds are dominated by small posters, so ~76% of every
dollar spent enriching them is wasted by definition.

**(b) We cannot tell who is American.** The official actor returns **no geo
fields at all** — no `business_address_json`, no city, no country. `pickCountry()`
in `lib/apify.ts` depends on that field and will always return null now, so US
detection collapses onto bio-text regex ("NYC", "Los Angeles", …), which matched
**0 of 24** in-band creators. Most creators simply don't write a city in their bio.

The June catalog was never really US-filtered either — its `country_seed` column
holds the language code `en`, not a country.

## 3. Location-based discovery — tested, works, but not sufficient alone

`apify/instagram-scraper` against an Instagram location page
(`/explore/locations/212988663/new-york-new-york/`) returned location metadata
plus 15 nested posts, yielding **15 unique creator usernames**, for **$0.0023**.
Cheap and genuinely geographic.

The catch: those creators are *at* a place, not *in* a niche — the NYC sample was
a piercing studio, the Flatiron Building, a jeweller. Location gives geography
and loses topical relevance; hashtags give relevance and lose geography.

Neither dimension is filterable at the source, which is the core tension.

## 4. Options worth considering

**A. Location × niche intersection (cheapest to try).** Discover from US
location pages, enrich, then keep only creators whose bio/category matches niche
keywords. Inverts the current funnel: geography is guaranteed, relevance is the
filter. Needs a list of US location IDs per target city.

**B. Instagram Graph API — Business Discovery (free, official).** With a
Facebook app plus an IG Business account, `business_discovery.username(...)`
returns `followers_count`, `biography`, `website`, `media_count` for any
Business/Creator account, at no per-profile cost. Rate-limited (~200 calls/hr)
and only covers professional accounts — but our targets are professional
accounts, and it would make enrichment free. Setup cost is a day of Meta app
plumbing. **Best long-term economics.** Still returns no country field.

**C. Drop or rework the US requirement.** Currently it discards 100% of
otherwise-good leads. Either accept non-US creators, or treat US as a
nice-to-have score rather than a hard filter. This is a business decision, not a
technical one — worth deciding before spending more.

**D. Paid influencer databases** (Modash, HypeAuditor, Phyllo). These carry
verified audience geography, which is the one thing scraping cannot give us.
Subscription cost, but they solve the geo problem outright.

## 5. Guards added to `scripts/scrape-batch.mjs`

- **Preflight probe** — enriches 3 known profiles before *any* spend and exits
  if the actor is unhealthy. Verified: refuses to start while rate-limited.
- **Abort guard** — stops the run when >30% of a batch returns no
  `followersCount`, instead of silently reading errors as "not a lead".
- `PRICE_POST` corrected 0.0026 → 0.0018 (measured against real billing).
- New flags: `--rotate` (fresh hashtag sets), `--tags`, `--posts`,
  `--skip-preflight`.

## 6. Salvaged

`data/pending-enrichment.json` — **1,185 fresh handles** already discovered and
paid for. Re-enrich these; do not pay for discovery again. At the official
actor's rate that is ~$2.73 to enrich all of them, expected to yield ~280
in-band creators (and ~0 that pass the current US filter — see §2).
