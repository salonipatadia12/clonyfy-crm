-- Clonify CRM — explicit provenance for simulated operational data (2026-09-05).
--
-- WHY A REGISTRY AND NOT A NAME PREFIX
--
-- Demo records have to be removable with certainty. Matching on `name like
-- 'DEMO%'` is not certainty: it deletes a real client someone genuinely named
-- "DEMO Rig Testing", and it misses every child row (a deliverable has no name
-- to prefix). So every demo-capable operational table carries a foreign key to
-- a `demo_runs` row, and reset deletes exactly the rows pointing at one run id.
-- No table-wide delete, no name matching, no LIKE.
--
-- WHAT NEVER GETS A DEMO FLAG
--
-- `influencers`. Demo campaigns reference REAL creator records from the
-- catalog, because the point of the fixture is to exercise the product against
-- the real catalog. A demo flag on a creator row would be a claim about that
-- creator, and reset could then delete a real record. The relationship
-- (campaign_creators) is demo-owned; the creator it points at is not, and
-- deleting a demo run leaves every influencer row byte-identical.

create table if not exists demo_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Stable per workspace, so re-running the seed finds and reuses its own run
  -- rather than creating a second one. This is what makes the seed idempotent.
  label        text not null,
  scenario     text,
  seeded_by    uuid references users(id),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, label)
);

alter table demo_runs enable row level security;
drop policy if exists demo_runs_select on demo_runs;
create policy demo_runs_select on demo_runs for select using (workspace_id = app_workspace());
drop policy if exists demo_runs_admin_write on demo_runs;
create policy demo_runs_admin_write on demo_runs for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- ---------------------------------------------------------------------------
-- Provenance column on every demo-capable operational table
-- ---------------------------------------------------------------------------
-- `on delete set null` rather than cascade: dropping a run registry row must
-- never silently delete business rows. Deletion is always explicit, in
-- scripts/reset-demo.mjs, in foreign-key-safe order.
alter table clients             add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table products            add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table campaigns           add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table campaign_creators   add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table outreach_activities add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table offers              add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table deliverables        add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table templates           add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table notifications       add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
alter table activity_log        add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;

-- A stable per-run key for each seeded row, so the seed can find the row it
-- created last time and UPDATE it instead of inserting a duplicate. This is the
-- second half of idempotence: the run id says "mine", the fixture key says
-- "which one".
alter table clients             add column if not exists demo_key text;
alter table products            add column if not exists demo_key text;
alter table campaigns           add column if not exists demo_key text;
alter table campaign_creators   add column if not exists demo_key text;
alter table outreach_activities add column if not exists demo_key text;
alter table offers              add column if not exists demo_key text;
alter table deliverables        add column if not exists demo_key text;
alter table templates           add column if not exists demo_key text;

create unique index if not exists clients_demo_key_uq   on clients             (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists products_demo_key_uq  on products            (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists campaigns_demo_key_uq on campaigns           (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists cc_demo_key_uq        on campaign_creators   (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists oa_demo_key_uq        on outreach_activities (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists offers_demo_key_uq    on offers              (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists dlv_demo_key_uq       on deliverables        (demo_run_id, demo_key) where demo_run_id is not null;
create unique index if not exists tpl_demo_key_uq       on templates           (demo_run_id, demo_key) where demo_run_id is not null;

-- Partial indexes: the overwhelmingly common query is "exclude demo rows", and
-- in a workspace with no demo data these cost nothing.
create index if not exists clients_demo_idx    on clients           (workspace_id) where demo_run_id is not null;
create index if not exists campaigns_demo_idx  on campaigns         (workspace_id) where demo_run_id is not null;
create index if not exists cc_demo_idx         on campaign_creators (workspace_id) where demo_run_id is not null;

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
-- Purely additive. `npm run demo:reset -- --confirm` removes the seeded rows;
-- dropping the columns and `demo_runs` afterwards restores the prior schema.
-- No existing column, constraint or row is modified by this migration.
