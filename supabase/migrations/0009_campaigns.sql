-- Campaigns / client grouping: a campaign is a client/brand engagement that
-- groups the creators you work (pipeline) and the deals you sign. No money.
create table if not exists campaigns (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  client       text,                 -- brand/client name (never a $ figure)
  brief        text,                 -- description / brief
  status       text not null default 'planning' check (status in ('planning','active','completed','archived')),
  start_date   date,
  end_date     date,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists campaigns_ws on campaigns (workspace_id, status);

alter table pipeline add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table deals    add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create index if not exists pipeline_ws_campaign on pipeline (workspace_id, campaign_id);
create index if not exists deals_ws_campaign    on deals    (workspace_id, campaign_id);

alter table campaigns enable row level security;
create policy camp_all on campaigns for all
  using (workspace_id = app_workspace()) with check (workspace_id = app_workspace());
