# Clonyfy — Influencer CRM

A bold, local-first CRM that turns the scrape pipeline's 3,000+ Instagram
creators into tracked outreach, deals, and revenue. Built with Next.js 16,
Tailwind, TanStack Query/Table, dnd-kit, and Recharts — backed by a local
SQLite store seeded straight from the scraper's CSV output.

**No accounts, no cloud, no env setup.** Seed it and run it.

## Quick start

```bash
npm install
npm run seed      # load the scraped creators into data/clonify.db
npm run demo      # OPTIONAL: populate sample pipeline + deals so the views feel alive
npm run dev       # http://localhost:3000
```

That's it — the app boots fully populated with every scraped creator.

> The seeder reads the live scraper output from `../output` if present, and
> otherwise falls back to the CSVs bundled in [`seed-data/`](seed-data) so a
> fresh clone is runnable on its own.

## What's inside

- **Command Center** — KPI tiles (total reach, Tier-A creators, active deals,
  revenue won, avg engagement), an outreach funnel, niche/engagement charts, and
  a "hot prospects" feed.
- **Influencers** — fast table over all creators: search, faceted filters
  (niche / tier / stage / market / verified), sortable columns, inline stage
  edits, multi-select bulk stage moves, CSV export, and **saved segments**.
- **Profile drawer** — per-creator Overview / Deals / Notes / Activity, with
  stage control and links to the IG profile + bio link.
- **Pipeline** — drag-and-drop kanban (dnd-kit) across 8 stages; moves persist
  and are recorded as history.
- **Deals** — every logged collaboration with revenue rollups (won vs in-flight)
  — answers "how many scraped creators have we actually closed?"
- **Analytics** — funnel conversion, tier/engagement composition, niche reach.

## Data flow

```
../output/instagram_outreach.csv  ──(npm run seed)──▶  data/clonify.db  (SQLite)
        +instagram_profiles.jsonl                            │
                                              lib/db  ──▶  app/api/*  ──▶  React Query  ──▶  UI
```

- Storage uses Node's built-in `node:sqlite` (no native build step).
- Re-running the scraper and `npm run seed` refreshes creator facts **without
  wiping CRM state** (stages, notes, deals are preserved — upsert by handle).
- All data access is centralized in `lib/db/index.ts`, so swapping to a hosted
  database later is a contained change.

## Scripts

| Command | What it does |
|---|---|
| `npm run seed` | Seed/refresh influencers from the scraper CSV |
| `npm run demo` | Reset CRM state and add realistic sample pipeline + deals |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |

## Structure

```
app/
  (dashboard)/ page.tsx          # Command Center
  (dashboard)/crm/influencers    # Influencer table + drawer
  (dashboard)/crm/pipeline       # dnd-kit kanban
  (dashboard)/crm/deals          # Deals + revenue
  (dashboard)/analytics          # Charts + funnel
  api/                           # influencers, deals, stats, segments, facets, notes
components/
  dashboard/ charts.tsx kpi-card.tsx
  crm/ pipeline-board.tsx influencer-drawer.tsx badges.tsx
  ui/ avatar tabs select badge button input sheet skeleton toaster
lib/
  db/ index.ts schema.ts         # SQLite access + DDL
  api.ts                         # React Query hooks
  utils.ts                       # colors, formatters, labels
scripts/
  seed.ts demo.ts
types/ database.ts
```

## License

ISC
