# Clonify CRM — UI & Product Redesign Audit

Date: 2026-09-05
Scope: `crm/` — Next.js 16 App Router + Supabase (project `zcdmzgmripwfnydzlwii`).

This document records what was found in the application before the redesign, why
each item is a problem for the actual business, and the decision taken. It is the
companion to the implementation; `LOGIC_AND_FLOWS.md` describes the end state.

---

## 0. Starting state

`git status` at the start of this work (branch `main`, last commit `31fdd88`):

- Modified: `.gitignore`, `app/(dashboard)/crm/influencers/page.tsx`,
  `app/api/influencers/route.ts`, `components/crm/deal-drawer.tsx`,
  `components/crm/influencer-drawer.tsx`, `components/layout/sidebar.tsx`,
  `lib/api.ts`, `lib/data.ts`, `lib/seed.ts`, `lib/utils.ts`, `package.json`,
  `scripts/db.mjs`, `scripts/scrape-batch.mjs`, `types/database.ts`
- Untracked: `app/(dashboard)/crm/outreach/`, `app/(dashboard)/sourcing/`,
  `app/api/sourcing/`, `components/crm/contact-badges.tsx`, several `scripts/*.mjs`,
  `supabase/migrations/0010_multi_platform.sql`, `supabase/migrations/0011_contact_fields.sql`

All of it was preserved. No file was deleted, no migration rewritten, no Git
history altered. New schema arrives as additive migrations `0012`–`0014`.

### Live data at audit time

| Table | Rows |
|---|---|
| `workspaces` | 1 (`Clonyfy`) |
| `users` | 1 (admin) |
| `influencers` | 4,596 (3 soft-hidden) |
| `pipeline` | 0 |
| `campaigns` | 0 |
| `deals` / `deal_videos` | 0 / 0 |
| `templates` / `saved_lists` / `comments` / `activity_log` | 0 |

The workspace is **catalog-only**: a large creator catalog and no operational
records. This drove two decisions:

1. The dashboard must be an onboarding/first-run surface, not a chart wall.
2. The pipeline→campaign migration has no rows to move today, but the migration
   still had to be written correctly, because the old `pipeline`/`deals` tables
   are kept and any row that appears in them is carried forward.

---

## 1. Visual system

**Found.** A purple neon / glassmorphism theme, dark-only by force:

- `app/layout.tsx` hardcoded `className="dark"` on `<html>`; `next-themes`
  defaulted to `dark`. There was no real light theme.
- `--primary: 263 80% 58%` (violet) as the single accent for every action,
  every active nav item, every badge and every chart series.
- `app/globals.css` `.app-canvas` painted three large radial "aurora" gradients
  behind the whole app; `.glass` / `.glass-strong` applied `backdrop-blur-xl`
  over translucent cards; `.card-hover` added a violet glow shadow; `.kpi-ring`
  added a violet drop shadow; `.gradient-text` was a violet→cyan→magenta clip.
- Rainbow KPI accents (`NICHE_HEX` starts `#8b5cf6, #06b6d4, #10b981, #f59e0b,
  #ec4899…`) used decoratively rather than to encode meaning.
- Secondary text sat at `--muted-foreground: 240 6% 60%` on a `240 14% 4%`
  canvas — low contrast, below AA for small text in several places.

**Decision.** Replace the token set with the neutral operations palette from the
brief (canvas `#F6F7F9`, surfaces `#FFFFFF`, ink `#172033`, secondary `#667085`,
borders `#E3E7EE`, primary `#3157D5`, teal `#0F766E`, amber `#B7791F`, red
`#C9362B`), default to **light**, keep dark mode as a neutral slate/ink theme,
and delete the aurora/glass/glow utilities. Radius drops from `0.85rem` to
10–12px. Geist is retained (already local via `next/font`-free CSS var, no
remote font added).

## 2. Information architecture

**Found.** Nine flat sidebar items mixing three overlapping concepts:
`Command Center`, `Influencers`, `Outreach Ready`, `Pipeline`, `Deals`,
`Campaigns`, `Templates`, `Analytics`, plus admin `Sourcing`, `Team`, `Audit`.

A user had to understand that a *Campaign* groups *Pipeline* rows, that a *Deal*
is a different object attached to a pipeline row, and that *Outreach Ready* is a
filtered view of the catalog — three names for overlapping stages of one job.

**Decision.** Primary nav becomes `Today · Creators · Campaigns · Outreach ·
Deliverables · Analytics`. `Clients` sits under Campaigns. Everything
administrative moves into an **Operations** group: `Sourcing`, `Data quality`,
`Team`, `Templates`, `Audit`, `Account`. "Pipeline" and "Deals" as standalone
destinations are retired; their function moves into the campaign board and into
Offers. The legacy routes are kept as redirects so no bookmark 404s.

Branding is normalised to **Clonify** in all visible copy. The workspace row is
still named `Clonyfy` in the database and the Supabase project ref is unchanged —
renaming those would be a data change for a spelling fix.

## 3. The architectural defect: a global pipeline

**Found.** `pipeline` is keyed `unique (workspace_id, handle, assigned_to)` and
carries a single `stage`. Migration `0009` bolted `campaign_id` onto that row.

Consequences:

- A creator can appear in only one campaign per owner. Adding them to a second
  campaign either collides with the unique key or silently re-tags the existing
  row, moving them *out* of the first campaign.
- `stage` is global. Moving a creator to `negotiating` for Client A's product
  also shows them as `negotiating` for Client B.
- Per-campaign facts (match score, offer, follow-up date, notes) had nowhere to
  live except that one shared row.
- `addToPipeline` (`lib/data.ts`) upserts on `workspace_id,handle,assigned_to`,
  so the second add is a no-op rather than a second campaign membership.

**Decision.** Introduce `campaign_creators` as the join table that owns the
relationship: `(campaign_id, influencer_id)` unique, with its own `stage`,
`owner_id`, `match_score`, `match_reasons`, `next_follow_up`, `notes`. Stage
lives on the *membership*, never on the creator. `pipeline` is left in place and
its rows are copied into `campaign_creators` by migration `0014`; nothing is
deleted.

## 4. Data-display bugs found

### 4.1 Impossible counts
`listInfluencers` filters `follower_count <= 500000 OR follower_count IS NULL`
(so unscraped candidates stay visible). `getFacets` computes the "grand total"
with `.lte('follower_count', 500000)` — and Postgres `lte` drops NULLs. Measured
against live data: list total **4,593**, facet total **4,579**. The influencers
page renders `{total} of {grandTotal}`, so it could and did print
"4,593 of 4,579". Fixed by giving both paths one shared predicate.

### 4.2 Language values rendered as countries
`influencers.country` holds `en` (1,122 rows) and `fr` (260 rows) — source
*language* codes, not geography — alongside real `US`/`us` (1,018 rows) and
2,196 NULLs. The catalog UI rendered `country` directly in a "Country" column,
so 30% of the catalog claimed to be from a country named "en".

Fixed by migration `0012`: language codes move to a new `language_code` column,
`country` is nulled for those rows, and a `geo_status` +`geo_evidence` pair
records what is actually known.

### 4.3 US evidence flattened
The 1,018 US-tagged rows have materially different evidence:
- 143 have a geocoded place string (`Durham, NC, USA`) — strong.
- 104 + 84 carry explicit `CONFIRMED_US` / `US_CONFIRMED` markers in `location`.
- 33 carry `US_LIKELY`.
- 272 (mostly lowercase `us`) have no location evidence at all — a CSV tag.
- 2,015 rows carry the literal string `UNKNOWN` in `location`.

Collapsing these to one "US" chip overstates what is known. `geo_status` now has
five honest levels (`confirmed_us`, `likely_us`, `unverified_us`, `non_us`,
`unknown`) and `geo_evidence` carries the sentence explaining which.

### 4.4 Platform link mislabelling
`profile_url` is presented as an Instagram link everywhere, but the catalog holds
155 YouTube channel URLs and 370 GitHub profile URLs (migration `0010` added
`platform`, the UI never caught up). `bio_link` is worse — it contains YouTube,
Facebook and Linktree URLs under an "Instagram" affordance. Fixed by deriving the
label from the URL host at render time (`linkLabelFor`), never from an assumption.

### 4.5 Radix accessibility errors
- `components/ui/sheet.tsx` renders `Dialog.Content` with no `Dialog.Title` and
  no `Dialog.Description`; Radix logs `DialogContent requires a DialogTitle` and
  a missing-description warning for every drawer and the mobile nav.
- `components/layout/mobile-header.tsx` puts `<Sidebar />` inside the sheet — but
  `Sidebar`'s root is `hidden md:flex`, so **the mobile navigation drawer opened
  empty**. Mobile users had no navigation at all.

Both fixed: `SheetContent` now requires a title and description (visually hidden
when the design does not show them), and the nav content is extracted into a
shared `NavContent` used by both the desktop rail and the mobile drawer.

### 4.6 "Outreach Ready" gate
`app/(dashboard)/crm/outreach/page.tsx` defined readiness as Instagram **and**
email **and** phone. Against live data that is 51 of 4,596 rows (1.1%), while 224
rows have an email and 4,057 have a working Instagram profile. The gate hid
almost every contactable creator. Replaced by per-channel queues; the
all-three-channels set survives as one optional strict filter.

### 4.7 Legacy filters
`eng_quality`, `account_type`, `quality_tier`, `market` were carried by the
scraper and are explicitly not to be surfaced. They are not exposed in the new UI
and remain in the table untouched.

## 5. Screen-by-screen findings

| Screen | Problem | Decision |
|---|---|---|
| `Command Center` (`app/(dashboard)/page.tsx`) | Five KPI tiles dominated by "4,596 profiles"; a 30-day activity area chart rendering a flat zero line; niche donut of catalog composition — none of it actionable, none of it about client work | Replaced by **Today**: follow-ups due/overdue, replies received, deliverables due, approvals waiting, campaigns at risk, recent activity, and first-run CTAs when empty |
| `Influencers` | Count bug (4.1); country bug (4.2); contact state shown as three unlabelled coloured dots (`ContactDots`); no sticky header; no column config; no density control; no URL-persisted filters; bulk actions limited to pipeline add/remove; mobile = the desktop table squeezed | Rebuilt as **Creators** with saved views, chip-rendered active filters, URL state, sticky header, column picker, density toggle, bulk add-to-campaign / assign owner / shortlist / export, and a card layout below `md` |
| `InfluencerDrawer` | A sheet with follower count, bio and a comment box; no campaign context, no history, no fit explanation; missing dialog title | Rebuilt as a creator workspace with Overview / Product fit / Campaign history / Outreach / Notes tabs |
| `Pipeline` | One global board; dnd-kit drag only, no keyboard/mobile path to change stage | Becomes the **campaign creator board**, per campaign, with list + board views and an always-available stage `<select>` |
| `Deals` + `NewDealModal` | Deal = title + videos_planned + notes. No money by prior policy, so a real collaboration could not be recorded | Becomes **Offers** with offer type, flat fee, commission %, gifted product, currency, negotiation status, agreement URL, usage rights, exclusivity, whitelisting. The old no-money rule is superseded by the new brief |
| `Campaigns` | Create modal = name + client + brief. Detail page = two flat lists | Guided multi-step creation (Basics → Objective → Creator brief → Offer → Deliverables → Messaging) and a six-tab detail page |
| `Templates` | name + subject + body only; no channel, no campaign, no variables, no preview | Channel-aware, campaign/product-bound, follow-up steps with delays, variable resolution with missing-variable warnings and live preview |
| `Analytics` | Funnel + niche mix + reach-by-niche + country mix, all catalog-shaped, no campaign filter | Rebuilt around campaign/product/client filters and only metrics backed by stored rows |

## 6. Honesty rules applied

These were treated as hard constraints while building:

- No value is invented for country, email, phone, follower count, engagement or
  performance. Absent data renders as an explicit "Not recorded" / "Unknown",
  never as a zero or a plausible default.
- **Match score is arithmetic, not AI.** `lib/match.ts` scores a creator against
  a campaign brief from stored fields only (niche overlap, follower range fit,
  geography, contact readiness, platform, prior work for the client) and returns
  the individual reasons that produced the number. Every reason shown in the UI
  is a fact from a column. Nothing is described as a confidence or a prediction.
- Nothing claims a message was sent. Outreach actions are "copy" and "log"; the
  logged row records what a human did.
- Organisations are never presented as creators without a review state.
  `entity_type` defaults to `unclassified`, a conservative heuristic marks likely
  organisations, and `qualification_status` is a generated column that can be
  overridden by an explicit human `review_state`.
- Money fields exist but are never populated for existing records.

## 7. Migrations added

| File | Purpose |
|---|---|
| `0012_data_quality.sql` | Additive data-quality layer on `influencers`: `entity_type`, `review_state`, generated `qualification_status`, `geo_status`, `geo_evidence`, `language_code`, generated `profile_completeness`, `last_verified_at`. Backfills geography honestly and moves `en`/`fr` out of `country`. |
| `0013_campaign_model.sql` | `clients`, `products`, campaign extension columns, `campaign_creators`, `outreach_activities`, `offers`, `deliverables`, template extension columns. RLS mirrors the existing workspace-isolation model. |
| `0014_migrate_pipeline.sql` | Idempotent forward-migration of `pipeline` → `campaign_creators`, `deals` → `offers`, `deal_videos` → `deliverables`. Source tables are **not** dropped. Documented reversal. |

## 8. Known limitations carried forward

- The 2,196 rows with no country and the 2,015 rows whose `location` is the
  literal `UNKNOWN` stay `geo_status = 'unknown'`. That is the truth; no
  inference was applied.
- Entity classification is a keyword heuristic over name/handle/bio. It marks
  candidates for review; it does not decide. 293 rows match organisation keywords.
- There is no email or Instagram sending integration, so outreach is copy + log.
- Performance metrics (views/likes/comments) are manual entry. There is no
  platform metrics API wired in, and no ROAS/revenue/conversion metric is
  computed from anything the user did not type.
