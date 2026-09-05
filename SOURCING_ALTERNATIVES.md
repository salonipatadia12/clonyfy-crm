# Creator sourcing without Apify — researched options (2026-09-02)

Every route below was tested live where testable. Verified findings are marked
**[tested]**; the rest are marked **[needs setup]** with what the setup costs.

The problem to solve, restated: we need creators in 7 tech/business/design
niches, **in the US**, in the 1k–500k band. Instagram scraping fails the US test
because no Instagram endpoint returns a country — see `SCRAPING_RESEARCH.md`.
**The routes below were chosen primarily on whether they expose real geography.**

---

## Tier 1 — Free, official, and they know where people are

### 1. YouTube Data API v3 — the strongest option **[needs setup: API key, 10 min]**

Free: **10,000 quota units/day**, no credit card.

The economics only work if you use the right endpoints:

| Call | Cost | Returns |
|---|---|---|
| `search.list` | **100 units** | 50 channel/video results |
| `channels.list` | **1 unit** | **up to 50 channels**, fully enriched |

That asymmetry is the whole game. `channels.list` costs **1 unit per 50
channels** — 0.02 units each. A day's free quota enriches on the order of
hundreds of thousands of channels. Discovery via `search.list` is the scarce
resource (~100 searches/day = ~5,000 results/day), so spend quota on search and
treat enrichment as free.

Returns per channel: `snippet.country` (**a real ISO country code**),
`statistics.subscriberCount`, `viewCount`, `videoCount`, title, description,
custom URL, publishedAt.

Why this matters: it fixes *both* Instagram failures at once — genuine country
filtering, and a subscriber count to band on, before spending anything.

Caveats: `country` is self-declared and not always set (fall back to
`defaultLanguage` + description signals). Subscriber counts are rounded by
policy. YouTube creators skew larger than IG micro-influencers.

### 2. GitHub REST API — ideal for the dev niches **[tested]**

Free: **5,000 requests/hour** authenticated (the `gh` CLI on this machine is
already authenticated), **30 searches/minute**.

Tested query:

```
search/users?q=location:USA+followers:>2000+language:javascript
```

Returned real people (kentcdodds, markerikson, ahejlsberg …). Profile lookup
returned:

```json
{ "login": "kentcdodds", "location": "Salt Lake City, Utah, USA",
  "followers": 35167, "blog": "https://kentcdodds.com",
  "twitter_username": "kentcdodds", "bio": "… Dev Educator …" }
```

**You can filter by location and follower count in the query itself** — the
exact targeting Instagram refuses to provide. `blog` and `twitter_username` are
the bridge to their other socials; personal sites almost always list Instagram.

Directly serves `web_dev`, `software_dev`, `technology` — 3 of the 7 niches.
Search caps at 1,000 results per query, so slice by language × location ×
follower band to go deeper.

### 3. Bluesky / AT Protocol — completely open **[tested]**

**No authentication, no key, no cost.** Tested:

```
GET https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=web+developer
```

Returned creators with handle, display name, and description. Follower counts
come from `app.bsky.actor.getProfile`. The entire protocol is public by design —
no rate-limit games, no anti-bot.

Skews tech/design-literate early adopters, which matches our niches well. No
country field; geography must come from bio text.

### 4. Dev.to (Forem) API — no auth at all **[tested]**

```
GET https://dev.to/api/articles?tag=webdev
```

Returns articles with a nested `user` carrying `username`, `name`,
**`twitter_username`, `github_username`**. Zero setup.

Best used as a **cross-platform bridge**: harvest active tech writers, then
resolve them to GitHub (for location + followers) or Twitter/Instagram.
Same pattern works on Hashnode and Medium tags.

---

## Tier 2 — Free but narrower

- **Twitch Helix API** — free with a Twitch app; live/creator data, but
  gaming-dominated. Weak fit for our niches.
- **Reddit API** — free tier still usable; good for finding *communities* and
  the people who post in them (r/webdev, r/entrepreneur), then resolving
  usernames outward. Not a creator database.
- **Podcast Index / Apple Podcasts RSS** — free, no key for RSS. Business and
  tech podcast hosts are high-value creators with public contact details. RSS
  feeds routinely include an email address, which our Instagram data never has.
- **Mastodon** — open API per instance; small but relevant on tech instances.

---

## Tier 3 — Free routes we already own

Already built in the Python pipeline; still free and re-runnable:

- **Serper.dev** — 2,500 free Google queries/month, no throttling
  (`discover.py`).
- **Keyless dorking via `r.jina.ai` + DuckDuckGo** — $0, unlimited-ish, slow.
- **Link-in-bio crawling** (Linktree/Beacons `__NEXT_DATA__`) — free, and it is
  where creator *emails* actually live. Our catalog has **zero** emails; this is
  the cheapest way to fix that for the 1,228 creators who have a bio link.

**Known flaw:** the Google-dork route is what put Macron and French Montana in
the catalog. Keep it for handle discovery only, never for ranking.

---

## Ruled out

- **TikTok Research API** — free but **academic/non-profit only**. Commercial
  users are explicitly ineligible and using it to build a paid tool gets access
  permanently revoked. Not an option for an agency.
- **Instagram Graph API (Business Discovery)** — free and official, returns
  followers/bio/website for professional accounts, but **no country field**, so
  it does not solve our actual blocker. Worth it later to make *enrichment* free
  once we have handles.
- **Paid databases** (Modash, HypeAuditor, Phyllo) — they do have verified
  audience geography, which nothing free provides. Real option if the US
  requirement is non-negotiable, but it's a subscription, not a scrape.

---

## Recommended plan

**Sequence, cheapest and most decisive first:**

1. **GitHub sweep** for `web_dev` / `software_dev` / `technology`. Already
   authenticated, free, filterable by US location and follower count today.
   Produces a clean, geo-verified list with links out to other platforms.
2. **YouTube Data API** for all 7 niches. One API key, ~10 minutes. Use
   `search.list` to discover and `channels.list` (50 at a time) to enrich —
   country and subscriber count included, effectively free.
3. **Bluesky + Dev.to** as no-auth supplements for design and marketing niches.
4. **Link-in-bio crawl** over the 1,228 existing creators with bio links to
   finally get **emails** into the catalog.

**Architectural change this implies:** the CRM's `influencers` table is
Instagram-shaped (`handle`, `profile_url`, `follower_count`). Multi-platform
sourcing needs a `platform` column and a per-platform identifier, plus a way to
link one human's several accounts. Worth designing before importing YouTube or
GitHub data, not after.
