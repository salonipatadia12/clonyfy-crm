-- Clonyfy CRM — Deals: collaborations with a creator who agreed, tracked by the
-- videos they deliver. No money/revenue here (spec forbids surfacing $); a deal
-- is "how many videos are they making" + per-video performance (manual entry).

create table if not exists deals (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  pipeline_id     uuid references pipeline(id) on delete set null,
  handle          text not null,
  influencer_name text,
  owner_id        uuid references users(id),
  title           text not null default 'Collaboration',
  status          text not null default 'active' check (status in ('active','completed','cancelled')),
  videos_planned  integer not null default 1,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deals_ws on deals (workspace_id, status, created_at desc);

-- One row per video the creator posted for the deal. views/likes/comments are
-- entered manually; engagement is derived ((likes+comments)/views) in the app.
create table if not exists deal_videos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  deal_id       uuid not null references deals(id) on delete cascade,
  title         text,
  url           text,
  views         integer,
  likes         integer,
  comments      integer,
  posted_at     date,
  created_at    timestamptz not null default now()
);
create index if not exists deal_videos_deal on deal_videos (workspace_id, deal_id, created_at);

-- RLS — workspace-scoped; mutate if you own the deal or you're an admin
-- (mirrors the pipeline ownership model). Defense-in-depth; the app uses the
-- service-role client and also scopes by workspace_id in code.
alter table deals enable row level security;
create policy deal_select on deals for select using (workspace_id = app_workspace());
create policy deal_insert on deals for insert with check (workspace_id = app_workspace() and (owner_id = auth.uid() or app_is_admin()));
create policy deal_update on deals for update using (workspace_id = app_workspace() and (owner_id = auth.uid() or app_is_admin()));
create policy deal_delete on deals for delete using (workspace_id = app_workspace() and (owner_id = auth.uid() or app_is_admin()));

alter table deal_videos enable row level security;
create policy dv_select on deal_videos for select using (workspace_id = app_workspace());
create policy dv_write  on deal_videos for all    using (workspace_id = app_workspace()) with check (workspace_id = app_workspace());
