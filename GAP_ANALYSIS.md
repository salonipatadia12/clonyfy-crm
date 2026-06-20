# Clonyfy CRM — Spec vs. Build Gap Analysis
Comparing `LOGIC_AND_FLOWS.md` (the spec) against the actual code. June 2026.

## TL;DR
The deployed build is a **single-user, local-SQLite, deal/revenue-focused CRM**.
The spec describes a **multi-user, Supabase-auth, team-assignment, no-money CRM**.
They diverge in two directions at once: the build is **missing** the team layer, and it **contains** a whole revenue/Deals layer the spec says to delete. Roughly **~60% aligned**.

---

## A. THE ARCHITECTURE FORK (decide this first)

| | Spec wants | Build has |
|---|---|---|
| Auth | Supabase Auth (email+password, invites) | **None** — fully open, no login |
| Users/roles | `users` table, admin / member | **None** |
| Multi-tenant | `workspace_id` everywhere + RLS | **None** — single shared DB |
| DB | Supabase/Postgres | **local SQLite** (`node:sqlite`), seeded from `instagram_outreach.csv` |

Everything role-based in the spec — assignments, reassignment, "My Assignments" tab, per-member analytics, notifications, per-user saved lists, conflict detection — **depends on this layer that doesn't exist yet.** This is the pivotal decision: building to spec means standing up Supabase auth + workspaces + RLS (a real re-architecture, not a patch). Note the current local-SQLite approach also doesn't persist on Vercel, so this move would fix the deployment too.

---

## B. BUILD HAS IT, SPEC SAYS DELETE IT

The spec §14 ("What does not exist") and §8 ("No $ ever") are explicit, but the build is full of these:

- **Deals page** (`/crm/deals`) + `new-deal-modal`, `deal-drawer` — spec says removed.
- **`collaborations` table** with `deal_value`, `currency` — money, forbidden.
- **Revenue everywhere**: dashboard KPI "Revenue Won", analytics "Revenue Over Time", "Top Deals", pipeline card deal-value badges — spec: "No $ calculations anywhere. Ever."
- **`engagement_rate`, `quality_tier`, `account_type` stored** in the influencers table — spec §2 says NEVER store these (they're correctly hidden from the UI, but still in the DB/seed).

→ Building to spec means **ripping out the entire Deals/revenue layer**, not just hiding it.

---

## C. SPEC WANTS IT, BUILD LACKS IT (the "missing functionalities")

**Team & assignment layer (all missing — needs the auth layer in A):**
- `assignments`, `reassignment_log`, `notifications`, `templates`, `users` tables
- Influencers page **tabs**: My Assignments / All Influencers / By Member (build has a single flat list)
- Assign-to-member + reassignment flows (+ audit log + notifications)
- Notifications bell + unread badge
- Per-member analytics / Team Performance

**Pipeline gaps:**
- **Conflict detection** modal (handle already in another member's pipeline) — missing
- **Last-touch warning** (>7 days on active stages) — metric shown, no warning
- **Commission** fields (type / % / flat, display-only) — missing entirely
- **Remove from pipeline** endpoint + action — missing
- Dedicated pipeline stage/commission endpoints (currently pigg-back on `PATCH /influencers/[id]`)

**Smaller gaps:**
- Templates are **hardcoded** in the drawer (3 fixed) — spec wants a CRUD `templates` table + variable resolution (`{{first_name}}`, `{{handle}}`, `{{follower_count}}`…)
- Notes need **auto-save on blur** (currently manual save button)
- Saved lists are **global**, spec wants **per-user**
- `activity_log` only accepts `kind='dm'` via API + lacks `user_id`/`metadata`; spec wants the full action enum (added_to_pipeline, stage_changed, reel_url_added, notes_updated, commission_set, reassigned, assigned, removed_from_pipeline)
- Analytics missing **Country Mix** chart

**Correctly matches spec already:** ✅ kanban + drag-drop, stage history, influencer filters (niche/follower/country/verified/hide-in-pipeline/search), Add Creator by URL, saved-filter lists (as `segments`), Use Template (copy-to-DM), Open on Instagram, activity feed, forbidden fields hidden from UI.

---

## Proposed build sequence (once the fork in A is decided)
1. **Foundation:** Supabase auth + `users`/`workspace_id` + RLS; migrate seed → Supabase (or keep SQLite + a lightweight auth if staying single-tenant).
2. **Strip:** remove Deals page, `collaborations`, all $ KPIs/charts; drop engagement/tier/account_type from the influencer store.
3. **Team layer:** `assignments` + `reassignment_log` + `notifications` tables, the two Influencers tabs, assign/reassign flows, notifications bell.
4. **Pipeline correctness:** conflict detection, last-touch warning, commission, remove-from-pipeline, full activity-log enum.
5. **Polish:** templates CRUD + variable resolution, notes auto-save, per-user saved lists, Country Mix chart, By-Member analytics.
</content>
