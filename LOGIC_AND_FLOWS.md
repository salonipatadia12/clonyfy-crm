# Clonify CRM — logic and flows

The implemented behaviour, as built. Where a rule exists to stop the product lying to its
user, that is stated as the reason. Column names are the real ones.

---

## 1. Auth, workspaces and RLS

- Supabase Auth. `/login` signs in or signs up; `middleware.ts` refreshes the session
  cookie and bounces unauthenticated users to `/login` (API routes answer `401` JSON
  instead of redirecting to HTML).
- A signed-up user with no profile row is sent to `/onboarding`, which creates the
  `workspaces` row and their `users` row as `admin`.
- Roles: `admin` and `member`. A trigger (`enforce_admin_cap`) rejects a third admin in
  one workspace.
- Every table has RLS on and is filtered through `app_workspace()`; admin-only writes use
  `app_is_admin()`. Both are `SECURITY DEFINER` so policies do not recurse through
  `users`.
- API routes call `requireCtx()`: it validates the session with the RLS client, then
  returns the profile plus a service-role handle. Every query in `lib/crm.ts` and
  `lib/data.ts` scopes by `profile.workspace_id` in code and enforces role in code, so
  workspace-wide reads work for members without fighting RLS.

**Visibility rule for campaign work.** A member sees the `campaign_creators` rows they own
plus unowned ones; an admin sees all. `offers`, `deliverables` and `outreach_activities`
inherit that through a subquery on `campaign_creators`, which is itself evaluated under
the caller's RLS, so a member cannot reach another member's offer by guessing an id.

---

## 2. Tables

### Catalog

`influencers` — the creator catalog, one row per (workspace, platform, handle).

Sourcing columns: `handle`, `full_name`, `follower_count`, `niche`, `biography`,
`bio_link`, `profile_url`, `is_verified`, `email`, `phone` (+ provenance columns for
both), `platform`, `source`, `external_id`, `location`, `discovery_route`,
`source_anchor`, `identity_confidence`, `scraped_at`, `hidden`.

Data-quality layer (migration `0012`):

| Column | Meaning |
|---|---|
| `entity_type` | `individual_creator` · `likely_organization` · `brand` · `institution` · `aggregator` · `unclassified` (default) |
| `review_state` | `unreviewed` · `approved` · `rejected` — an explicit human decision |
| `qualification_status` | **Generated.** `approved` → qualified; `rejected` → disqualified; org/aggregator → needs_review; non-Instagram → cross_platform; unverified → awaiting_verification; missing follower count or niche → needs_review; else qualified |
| `geo_status` | `confirmed_us` · `likely_us` · `unverified_us` · `non_us` · `unknown` |
| `geo_evidence` | The sentence justifying `geo_status`. Never null after `0012` |
| `language_code` | Where `en`/`fr` went when they were removed from `country` |
| `profile_completeness` | **Generated**, 0–8, counted from the fields that are actually filled in |
| `contact_status` | **Generated** from `email`/`phone`: complete · email_only · phone_only · none |
| `last_verified_at` | Backfilled from `scraped_at`; updated when a human reviews the record |

Generated columns cannot drift from the data they describe, which is why qualification and
completeness are computed rather than stored by hand.

### Client work

| Table | Row means |
|---|---|
| `clients` | A brand you run campaigns for |
| `products` | A thing you ask creators to talk about. Reusable across campaigns |
| `campaigns` | One product, one client, one brief, one offer shape, one deliverable plan, one messaging block |
| `campaign_creators` | **One creator's participation in one campaign.** Unique on `(campaign_id, influencer_id)` |
| `outreach_activities` | One touch a human performed or received |
| `offers` | The commercial terms for one participation. Unique on `campaign_creator_id` |
| `deliverables` | A piece of content owed under one participation. Many per row |

`campaigns` columns beyond the basics: `objective`, `objective_note`; the brief
(`brief_niches`, `brief_min_followers`, `brief_max_followers`, `brief_geo`,
`brief_platforms`, `brief_entity_types`, `brief_contact_pref`, `brief_creator_target`,
`brief_exclusions`, `brief_notes`); the offer (`offer_type`, `offer_flat_fee`,
`offer_commission_pct`, `offer_gifted_product`, `offer_currency`, `budget_total`); the
plan (`deliverable_plan` jsonb, `usage_rights`, `whitelisting`, `approval_required`); and
messaging (`talking_points`, `cta`, `discount_code`, `tracking_url`, `hashtags`,
`disclosure_required`, `prohibited_language`).

`templates` gained `channel` (`instagram_dm` | `email`), `campaign_id`, `product_id` and
`follow_ups` (jsonb: `[{ step, delay_days, subject, body }]`).

### Kept, not dropped

`pipeline`, `deals`, `deal_videos`, `assignments`, `reassignment_log`, `collaborations`
are untouched. Migration `0014` copies their rows forward; it only inserts.

---

## 3. Stages

The stage lives on `campaign_creators.stage`:

`suggested → shortlisted → ready_to_contact → contacted → replied → negotiating →
agreed → content_in_progress → live → completed`, plus `rejected` as the archive.

Legacy `pipeline.stage` maps forward as: prospecting→shortlisted, contacted→contacted,
responded→replied, negotiating→negotiating, closed→agreed, live→live,
completed→completed, archived→rejected.

**Stages never move backwards automatically.** Logging a late note on an agreed creator
does not drag them back to *Contacted*; the code compares ladder positions before
advancing.

Automatic advances (all forward-only):
- logging an outbound touch → at least `contacted`
- logging an inbound reply, or a positive/negative reply status → at least `replied`
- accepting an offer → at least `agreed`
- a deliverable moving to submitted/approved → at least `content_in_progress`
- a deliverable published → at least `live`

---

## 4. The flows

### 4.1 Set up the work

1. **Clients & products** → add a client, then its products. Nothing is pre-seeded.
2. **Campaigns → New** → a six-step form: Basics (name, product — the client follows the
   product automatically, owner, status, dates) → Objective → Creator brief → Offer →
   Deliverables → Messaging & tracking. Only *name* and *product* are required; "Create
   now" is available from any step.

### 4.2 Find creators for a product

3. The campaign's **Find creators** button opens `/creators` pre-filtered from the brief
   (all target niches, geography, platform, contact preference) and excluding creators
   already in that campaign.
4. **Creators** opens on *Qualified creators*. Other saved views: Confirmed/likely US,
   Email available, Phone available, Needs contact enrichment, Awaiting Instagram
   verification, Needs classification, Already used in campaigns, All records. Every
   filter is in the URL, shown as a removable chip, and clearable in one click.
5. Select rows → **Add to campaign**. Each creator gets a `campaign_creators` row scored
   against that campaign's brief. Re-adding someone already in the campaign is reported,
   not duplicated; their other campaigns are untouched.

### 4.3 Understand the fit

6. Open a creator → **Product fit**, scored against any campaign you pick.

   `lib/match.ts` weights: niche 30, follower range 25, geography 20, contact readiness
   15, platform 10. Only the dimensions the brief actually constrains count toward the
   denominator, so a sparse brief does not depress every score. Each dimension returns a
   `MatchReason` with a `kind`, a short label, a full sentence and its points.

   *Blockers* are stated campaign requirements the creator fails — US-only vs a non-US
   location, an email-only campaign vs no email, a required account type. A blocker sets
   the score to 0 and is shown separately from the scoring reasons.

   An empty brief returns `score: null`, and the UI says the brief needs filling in rather
   than printing `0%`.

   Re-scoring after editing a brief: **Overview → Re-score creators against this brief**.

### 4.4 Reach out

7. **Outreach** (or the campaign's Outreach tab) groups work into queues:
   *Follow-up due*, *Replied*, *Awaiting response*, *Instagram DM ready*, *Email ready*,
   *Phone available*, *Missing contact*. The channel queues are additive — a creator
   appears in every queue they qualify for. Only a creator with no Instagram profile, no
   email and no phone lands in *Missing contact*.
8. **Compose & log** shows which client product you are pitching, resolves the template
   variables against the real campaign and creator, warns about any variable with no
   value, copies the text, and records the touch with a reply status and a follow-up date.
   Clonify does not send anything.

   Variables: `first_name`, `full_name`, `handle`, `niche`, `followers`, `client`,
   `product`, `campaign`, `offer`, `cta`, `discount_code`, `tracking_url`,
   `talking_point`, `sender_name`. A variable with no value renders blank and is listed
   as missing — a raw `{{token}}` never reaches text the user is about to send.

### 4.5 Agree terms

9. **Offers** — offer type, flat fee, commission %, gifted product, currency, negotiation
   status, agreed date, agreement URL, usage rights, exclusivity, whitelisting, notes.
   A new offer inherits the campaign's default shape but no amount is invented: a blank
   fee stays blank and reads as "not recorded". Marking one *accepted* moves the creator
   to *Agreed*.

### 4.6 Ship the content

10. **Deliverables** — platform, type, title, brief, due date, submitted URL, approval
    state (`planned → submitted → changes_requested → approved → published`), feedback,
    published URL and date, and manually entered views/likes/comments/saves/clicks/
    conversions. A campaign's `deliverable_plan` can be applied to a creator in one step.
11. Views: All, Due soon (next 7 days), Overdue, Awaiting approval, Published — filtered
    by campaign and owner.

### 4.7 Measure

12. **Analytics**, filtered by client, product and campaign:
    - stage funnel (each bar counts creators who reached that stage *or beyond*, so it
      only ever decreases) and the step-to-step conversion rates;
    - outreach: messages logged, creators contacted, replies, positive replies, reply
      rate, median first-response time (first outbound → first inbound, per creator);
    - agreements: creators agreed, offers accepted, committed compensation (sum of flat
      fees on accepted offers, or "no fees recorded");
    - deliverables planned/submitted/approved/published/overdue;
    - published content views/likes/comments/clicks, **with the coverage stated** — "the
      3 of 11 published deliverables that have numbers entered".

    No ROAS, revenue or conversion figure is computed from anything a person did not type.

---

## 5. Today

Answers "what needs me now": follow-ups overdue and due today, replies received,
deliverables due in the next 7 days, content awaiting approval, campaigns falling behind,
the active campaign summary, and recent activity.

"Falling behind" is a list of stated reasons, not a score: overdue follow-ups, overdue
deliverables, an end date that has passed, fewer creators than the target, or an active
campaign with no creators.

With no campaigns yet, Today becomes a four-step setup guide (client & product → campaign
→ shortlist creators → write a template) with each step's completion shown. Catalog size
is reported under "Workspace contents"; it does not lead the page.

---

## 6. Honest-rendering rules

| Rule | Where enforced |
|---|---|
| A language code is never shown as a country | `0012` moves `en`/`fr` to `language_code`; the UI renders `geo_status` |
| US evidence keeps its confidence level | five `geo_status` values, each with `geo_evidence` |
| Links are labelled by host | `linkLabelFor()` in `lib/domain.ts` |
| Phone is never an outreach gate | `queuesFor()` in `lib/outreach-queues.ts` |
| Match scores are explainable, empty briefs score `null` | `lib/match.ts` |
| Organisations carry a visible review status | `entity_type` + generated `qualification_status` |
| Counts cannot contradict | `applyCatalogScope()` — one predicate for every count and page |
| Missing numbers read as "Not recorded" | `Metric`, `Followers`, `orNotRecorded` |
| Dialogs and sheets always have an accessible name | `SheetContent` requires `title` and `description` |

---

## 6b. Creator qualification

`qualification_status` is a generated column. It is evaluated top-down and the first
matching branch wins:

| Condition | Status | What it asserts |
|---|---|---|
| `review_state = 'rejected'` | `disqualified` | A person rejected it. |
| `review_state = 'approved'` | `qualified` | A person confirmed it. |
| `entity_type` in likely_organization / brand / business / institution / government / publisher / aggregator | `needs_review` | It looks like an organisation. |
| `platform <> 'instagram'` | `cross_platform` | No Instagram profile recorded. |
| `verification_status = 'pending_instagram_verification'` | `awaiting_verification` | Sourced contact-first; followers and niche provisional. |
| `follower_count is null or niche is null` | `needs_review` | Not enough on the record to judge it. |
| `entity_type = 'individual_creator'` | `qualified` | Positively identified as a person. |
| otherwise | `candidate` | Nothing against it; nobody has confirmed it. |

There is no path from "no keyword matched" to `qualified`. `entity_source` records
whether the classification came from the heuristic or a human, and a heuristic backfill
never overwrites a human decision. `creator_reviews` holds the audit trail.

## 6c. Demo data

`demo_runs` is the registry; every demo-capable table carries `demo_run_id` and a
`demo_key` (unique per run) that makes the seed idempotent. `influencers` deliberately
carries neither.

| Script | Behaviour |
|---|---|
| `scripts/seed-demo.mjs` | Transactional upsert by `(demo_run_id, demo_key)`. Prints inserted / reused / updated / skipped / failed per table. Reads the catalog; never writes to it. |
| `scripts/reset-demo.mjs` | Dry run unless `--confirm`. Deletes `where demo_run_id = $1` only, child-first, in one transaction, then diffs every protected table and fails if one changed. |

Deletion order: deliverables → offers → outreach_activities → campaign_creators →
templates → notifications → activity_log → campaigns → products → clients.

## 7. Migrations

| File | Adds |
|---|---|
| `0001`–`0009` | Original workspace, catalog, pipeline, deals, campaigns-as-tags |
| `0010` | `platform`, `source`, `external_id`, `location`; uniqueness becomes per platform |
| `0011` | Phone + contact provenance, `verification_status`, generated `contact_status` |
| `0012` | Data-quality layer; moves language codes out of `country`; grades US evidence |
| `0013` | `clients`, `products`, campaign extension columns, `campaign_creators`, `outreach_activities`, `offers`, `deliverables`, template extensions, RLS |
| `0014` | Copies `pipeline` → `campaign_creators`, `deals` → `offers`, `deal_videos` → `deliverables`. Insert-only and idempotent |

`0012` and `0014` document their reversal at the bottom of the file. `0014` never deletes
from the source tables, so reversing it restores the exact prior state.

---

## 8. Testing

`npm test` — 29 unit tests over matching, template variables, outreach queues and the
honest-rendering rules (EN/FR never a country, YouTube never labelled Instagram, phone
never a gate, empty brief scores `null`, missing variables reported).

`npm run test:integration` — 19 tests against the live schema: a creator in two campaigns
at once, a move in one campaign leaving the other untouched, per-relationship fields not
bleeding, offers and deliverables scoped to the relationship, deleting a campaign leaving
the catalog intact, no view exceeding the catalog total, no language code left in
`country`, geography evidence present on every row, human review overriding the
heuristic, generated completeness matching its inputs, RLS enabled and policied on all six
new tables, and the legacy tables still present. Fixtures are namespaced and removed in
`after()`.
