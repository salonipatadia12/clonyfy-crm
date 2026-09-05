# Clonify CRM

Influencer operations for an agency that markets **different client products through
different creators**. Clonify is where you set up a campaign for a product, find and
shortlist creators for it, run the outreach yourself, agree terms, track the content,
and see whether it worked.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase (auth +
Postgres + RLS) · TanStack Query & Table · dnd-kit · Recharts · Radix primitives ·
Sonner · Lucide.

---

## What this is for

1. Store influencers.
2. Find their contact details.
3. Assign them to a client's product campaign.
4. Track whether they were contacted and whether they replied.

Four screens: **Dashboard · Influencers · Campaigns · Settings**. Outreach,
offers and deliverables are not destinations — they are things you do to an
influencer inside a campaign, so they live on the campaign page.

An influencer sits in exactly one of five statuses per campaign:
`Not contacted → Contacted → Replied → Interested / Declined`. Five, not eleven,
because those are the only distinctions the work actually turns on.

## The one idea that shapes everything

**A creator's stage belongs to a campaign, not to the creator.**

`campaign_creators` is the join row between a campaign and a creator, and it carries the
stage, the owner, the fit score, the follow-up date, the notes, the offer and the
deliverables. So:

- the same creator can sit in as many campaigns as you like, at the same time;
- moving them to *Negotiating* for Client A changes nothing for Client B;
- their history across every campaign is one query, and it is shown on their profile.

The older `pipeline` table put one global `stage` on the creator. It is still in the
database and its rows were copied forward by migration `0014`; nothing was dropped.

---

## Running it

```bash
npm install
cp .env.local.example .env.local     # then fill in the Supabase values
npm run migrate                      # applies supabase/migrations/*.sql in order
npm run dev                          # http://localhost:3000
```

Required environment (`.env.local`):

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client; every query runs under the user's JWT, so RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. API routes validate the session first, then query with this and scope by `workspace_id` in code |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | Migration/backup scripts (session-mode pooler) |
| `APIFY_TOKEN`, `APIFY_*_ACTOR` | Optional. Scrape-on-demand in Operations → Sourcing |
| `YOUTUBE_API_KEY` | Optional. Cross-platform sourcing scripts |

First run: sign up at `/login`, then `/onboarding` creates the workspace and makes you
its admin. A workspace allows at most two admins (enforced by a database trigger).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint 9 flat config (`eslint.config.mjs`) |
| `npm test` | Unit tests — matching, template variables, honest-rendering rules |
| `npm run test:integration` | Integration tests against the live schema (creates and removes its own fixtures) |
| `npm run test:demo` | Demo seed/reset tests — idempotence, safe deletion, qualification correctness |
| `npm run test:all` | All three |
| `npm run demo:seed` | Seed simulated operational data (idempotent; `-- --dry` to preview) |
| `npm run demo:reset` | Dry run by default; `-- --confirm` to delete the demo run |
| `npm run migrate` | Applies every `supabase/migrations/*.sql` |
| `npm run backup` / `restore` | Gzipped JSON snapshot of every table |

---

## The screens

| Screen | What it is for |
|---|---|
| **Today** | Follow-ups due and overdue, replies to action, deliverables due, content awaiting approval, campaigns falling behind, recent activity. On an empty workspace it becomes a four-step setup guide instead of a chart wall. |
| **Creators** | The catalog, organised by how much is actually known about each record. Saved views, URL-persisted filters, sticky header, configurable columns, density toggle, bulk add-to-campaign / assign owner / export. Cards below `md`. |
| **Campaigns** | One campaign per client product. Guided six-step creation, then a six-tab detail page: Overview, Creators (board + list), Outreach, Offers, Deliverables, Performance. |
| **Outreach** | Per-channel work queues. Compose from a template with real campaign values, copy it, log what you sent. |
| **Deliverables** | Due soon, overdue, awaiting approval, published — filterable by campaign and owner. |
| **Analytics** | Filterable by client, product and campaign. Only metrics backed by stored rows. |
| **Operations** | Clients & products, Data quality, Templates, Sourcing, Team, Audit, Account. |

Legacy routes (`/crm/influencers`, `/crm/pipeline`, `/crm/deals`, `/crm/outreach`)
redirect to their replacements so existing links keep working.

---

## Rules the code actually enforces

These are product requirements, not style preferences. Each one has a test.

**Nothing is invented.** No value is fabricated for country, email, phone, follower
count, engagement or performance. A missing number renders as "Not recorded", never as
`0` and never as a plausible guess.

**A language code is never a country.** The catalog's `country` column held `en` (1,122
rows) and `fr` (260). Migration `0012` moved them to `language_code` and cleared
`country`. Geography is now `geo_status` — `confirmed_us`, `likely_us`, `unverified_us`,
`non_us`, `unknown` — each with a `geo_evidence` sentence saying why.

**Three words, not six.** The influencer table reads *Confirmed creator*,
*Needs review* or *Not a creator*. An organisation nobody has reviewed is
"Needs review" — never "Confirmed". The six-value `qualification_status` still
backs it, but it is not vocabulary the user has to learn.

**"Qualified" means a person said so.** The derived `qualification_status` originally
ended in `else 'qualified'`, so every record that had simply failed to match an
organisation keyword was presented as a qualified creator — all 3,138 of them, including
Kennedy Space Center, Google Cloud, BlackRock, NVIDIA AI, Apple Books and the French
Presidency. Migration `0015` replaced that fallthrough with `candidate`: usable,
searchable, addable to a campaign, and *not claimed to be a person*. `qualified` now
requires `review_state = 'approved'` or a human-set `entity_type = 'individual_creator'`,
and every manual decision writes a `creator_reviews` row with the actor, timestamp,
previous state, new state and optional reason.

**Demo data is provenance-tracked, never name-matched.** Every simulated row carries a
`demo_run_id` foreign key to `demo_runs`. `npm run demo:reset -- --confirm` deletes
exactly the rows pointing at one run, child-first, in a transaction — no `LIKE 'DEMO%'`,
no table-wide delete. `influencers` has no demo column at all: demo campaigns reference
**real** catalog records, so a reset removes the simulated relationship and leaves the
creator untouched. The reset script diffs every protected table before and after and
fails if one moved.

**A link is labelled by where it goes.** `profile_url` holds YouTube channels and GitHub
profiles as well as Instagram; `bio_link` holds Linktree, Facebook and YouTube URLs.
`linkLabelFor()` reads the host, so nothing is called "Instagram" unless it is.

**Match scores are arithmetic, not AI.** `lib/match.ts` scores a creator against a
campaign brief using only stored fields — niche overlap, follower-range fit, geography
confidence, contact readiness, platform, account classification — and returns the
individual reasons. Every reason shown in the UI is a fact from a column. An empty brief
returns `null`, not `0%`, because "no criteria" is not "no fit".

**Outreach readiness is per channel.** A creator with a working Instagram profile can be
DM'd whether or not anyone found their email. Phone is a bonus, never a gate. The
all-three-channels set is one optional filter, not the definition.

**Nothing claims to send.** Clonify prepares a message and records what a human did with
it. There is no email or Instagram provider integration.

**Organisations are flagged, not disguised.** `entity_type` defaults to `unclassified`; a
conservative keyword heuristic marks likely organisations and aggregator feeds;
`qualification_status` is a generated column that an explicit human `review_state`
overrides. Nothing is presented as an influencer without a visible status.

**Counts cannot contradict each other.** Every catalog count goes through one predicate
(`applyCatalogScope`), so a filtered subset can never exceed the total.

---

## Data model

```
workspaces ─┬─ users
            ├─ clients ── products ── campaigns ── campaign_creators ─┬─ outreach_activities
            │                                            │            ├─ offers (1:1)
            │                                            │            └─ deliverables (1:n)
            │                                    influencers (catalog)
            └─ templates, saved_lists, notifications, activity_log, audit tables
```

Migrations are additive and numbered. `0012` adds the data-quality layer, `0013` adds the
client/product/campaign-creator model, `0014` copies `pipeline`/`deals`/`deal_videos`
forward. See `LOGIC_AND_FLOWS.md` for the full column list and the flows.

### Security

Every table has RLS enabled and is scoped by `workspace_id` through the
`app_workspace()` / `app_is_admin()` helpers. `campaign_creators` follows the ownership
rule it replaces: a member sees and edits the relationships they own (plus unowned ones),
an admin sees the whole workspace. Children (`offers`, `deliverables`,
`outreach_activities`) inherit visibility through a subquery on `campaign_creators`,
which is itself evaluated under the caller's RLS.

API routes validate the session with `getUser()` before touching the service-role client,
and every query filters by `workspace_id` explicitly.

---

## Design system

Light by default; dark is a neutral ink/slate theme. Tokens live in `app/globals.css`.

| Role | Light |
|---|---|
| Canvas | `#F6F7F9` |
| Surface | `#FFFFFF` |
| Text | `#172033` / `#667085` |
| Border | `#E3E7EE` |
| Primary | `#3157D5` |
| Success | `#0F766E` |
| Warning | `#B7791F` |
| Danger | `#C9362B` |

Solid surfaces, one-pixel borders, 10–12px radii, a 4/8px spacing rhythm, tabular figures
in tables, and a single visible focus ring. No gradients, no glass, no glow. Colour never
carries meaning alone — every status badge has a text label.

`components/ui/sheet.tsx` requires `title` and `description` as parameters, so a new
drawer cannot ship without an accessible name.

---

## Known limitations

- 3,578 catalog records have no usable geography and stay `unknown`. No inference was
  applied.
- Entity classification is a keyword heuristic that marks records for review; it never
  decides that something is an individual creator. `qualified` is therefore 0 until
  someone reviews records in the creator drawer — that is the honest number, not a bug.
- The demo fixture's creator selection skips any record whose display name or handle is
  ambiguous (1,463 of 2,865 eligible records), rather than guessing. It reads the catalog
  and never writes to it.
- `outreach_activities` has no draft/sent column, so a "draft" in the fixture is a row
  whose body is marked `[Simulated — never sent]` and whose reply status is `none`.
- Performance metrics are manual entry. There is no platform metrics API, and no ROAS,
  revenue or conversion figure is derived from anything a person did not type.
- Follow-up "delays" on a template sequence are guidance for whoever works the queue.
  Nothing is scheduled or sent.
