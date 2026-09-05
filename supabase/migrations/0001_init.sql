-- Clonyfy CRM — Supabase foundation (multi-tenant, auth, RLS)
-- Implements LOGIC_AND_FLOWS.md §1 (auth/roles/RLS) and §2 (tables).
-- Apply with: supabase db push   (or paste into the Supabase SQL editor).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Workspaces & users (profile rows linked to Supabase auth.users)
-- ---------------------------------------------------------------------------
create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,
  email           text not null,
  role            text not null default 'member' check (role in ('admin','member')),
  invite_accepted boolean not null default false,
  last_active     timestamptz,
  created_at      timestamptz not null default now()
);
create index on users (workspace_id);

-- Helper functions used by RLS (SECURITY DEFINER to read the users table
-- without recursing through its own RLS).
create or replace function app_workspace() returns uuid
  language sql stable security definer set search_path = public as
$$ select workspace_id from users where id = auth.uid() $$;

create or replace function app_role() returns text
  language sql stable security definer set search_path = public as
$$ select role from users where id = auth.uid() $$;

create or replace function app_is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(app_role() = 'admin', false) $$;

-- enforce "max 2 admins per workspace" (spec §1)
create or replace function enforce_admin_cap() returns trigger
  language plpgsql as $$
begin
  if new.role = 'admin' and (
    select count(*) from users
    where workspace_id = new.workspace_id and role = 'admin' and id <> new.id
  ) >= 2 then
    raise exception 'workspace already has 2 admins';
  end if;
  return new;
end $$;
create trigger trg_admin_cap before insert or update on users
  for each row execute function enforce_admin_cap();

-- ---------------------------------------------------------------------------
-- Influencers (seeded from instagram_outreach.csv). Spec §2 core fields;
-- extra scraper columns are carried but nullable + never surfaced.
-- ---------------------------------------------------------------------------
create table influencers (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  handle         text not null,
  full_name      text,
  follower_count bigint,
  niche          text,
  country        text,
  biography      text,
  bio_link       text,
  profile_url    text,
  is_verified    boolean default false,
  email          text,
  scraped_at     timestamptz,
  -- carried from scraper, hidden per spec (kept so we don't lose data):
  engagement_rate numeric, eng_quality text, account_type text,
  quality_tier text, market text, follower_bucket text,
  created_at     timestamptz not null default now(),
  unique (workspace_id, handle)
);
create index on influencers (workspace_id, niche);
create index on influencers (workspace_id, follower_count);

-- ---------------------------------------------------------------------------
-- Pipeline (spec §2). assigned_to drives member visibility.
-- ---------------------------------------------------------------------------
create table pipeline (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  handle          text not null,
  full_name       text,
  follower_count  bigint,
  niche           text,
  country         text,
  profile_url     text,
  biography       text,
  is_verified     boolean default false,
  stage           text not null default 'prospecting'
                    check (stage in ('prospecting','contacted','responded',
                      'negotiating','closed','live','completed','archived')),
  assigned_to     uuid references users(id),
  assigned_name   text,
  assigned_at     timestamptz,
  assigned_by     uuid references users(id),
  notes           text,
  last_touch      timestamptz,
  added_at        timestamptz not null default now(),
  added_via       text,
  reel_url        text,
  reel_views      bigint,
  commission_type        text check (commission_type in ('percentage','flat','both')),
  commission_percentage  numeric,
  commission_flat        text,
  unique (workspace_id, handle, assigned_to)
);
create index on pipeline (workspace_id, assigned_to);
create index on pipeline (workspace_id, stage);

-- ---------------------------------------------------------------------------
-- Assignments, activity, reassignment, templates, saved lists, notifications
-- ---------------------------------------------------------------------------
create table assignments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  influencer_handle text not null,
  assigned_to       uuid not null references users(id),
  assigned_by       uuid not null references users(id),
  assigned_at       timestamptz not null default now(),
  status            text not null default 'pending'
                      check (status in ('pending','added_to_pipeline')),
  pipeline_id       uuid references pipeline(id) on delete set null
);
create index on assignments (workspace_id, assigned_to);

create table activity_log (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  user_id        uuid references users(id),
  user_name      text,
  profile_handle text,
  profile_name   text,
  action         text not null check (action in ('added_to_pipeline','stage_changed',
                   'reel_url_added','notes_updated','commission_set','reassigned',
                   'assigned','removed_from_pipeline')),
  metadata       jsonb,
  created_at     timestamptz not null default now()
);
create index on activity_log (workspace_id, created_at desc);
create index on activity_log (workspace_id, profile_handle);

create table reassignment_log (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  admin_id       uuid references users(id),
  admin_name     text,
  from_user_id   uuid references users(id),
  from_user_name text,
  to_user_id     uuid references users(id),
  to_user_name   text,
  profile_handle text,
  profile_name   text,
  reason         text,
  created_at     timestamptz not null default now()
);
create index on reassignment_log (workspace_id);

create table templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by   uuid references users(id),
  name         text not null,
  subject      text,
  body         text not null,
  tags         text[],
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table saved_lists (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by   uuid not null references users(id),
  name         text not null,
  filters      jsonb not null default '{}',
  match_count  integer default 0,
  last_used    timestamptz,
  created_at   timestamptz not null default now()
);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references users(id),
  message      text not null,
  type         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on notifications (user_id, read);

-- Deals/revenue: HIDDEN from UI but kept (user choice). workspace-scoped.
create table collaborations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  handle       text not null,
  title        text,
  status       text default 'active',
  deal_value   numeric,
  currency     text default 'USD',
  reel_url     text,
  reel_views   bigint,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (spec §1)
-- ---------------------------------------------------------------------------
alter table workspaces       enable row level security;
alter table users            enable row level security;
alter table influencers      enable row level security;
alter table pipeline         enable row level security;
alter table assignments      enable row level security;
alter table activity_log     enable row level security;
alter table reassignment_log enable row level security;
alter table templates        enable row level security;
alter table saved_lists      enable row level security;
alter table notifications    enable row level security;
alter table collaborations   enable row level security;

-- everyone sees rows in their own workspace; helper keeps policies short
create policy ws_select on workspaces for select using (id = app_workspace());

create policy users_select on users for select using (workspace_id = app_workspace());
create policy users_admin_write on users for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- influencers: all workspace members read; only admin writes (Add Creator)
create policy inf_select on influencers for select using (workspace_id = app_workspace());
create policy inf_admin_write on influencers for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- pipeline: member sees own, admin sees all; insert binds to self; admin can update any
create policy pl_select on pipeline for select
  using (workspace_id = app_workspace() and (assigned_to = auth.uid() or app_is_admin()));
create policy pl_insert on pipeline for insert
  with check (workspace_id = app_workspace() and assigned_to = auth.uid());
create policy pl_update on pipeline for update
  using (workspace_id = app_workspace() and (assigned_to = auth.uid() or app_is_admin()));
create policy pl_delete on pipeline for delete
  using (workspace_id = app_workspace() and (assigned_to = auth.uid() or app_is_admin()));

-- assignments: member sees own, admin sees all; only admin creates/updates
create policy asg_select on assignments for select
  using (workspace_id = app_workspace() and (assigned_to = auth.uid() or app_is_admin()));
create policy asg_admin_write on assignments for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- activity_log: member sees own actions, admin sees all; any member inserts
create policy act_select on activity_log for select
  using (workspace_id = app_workspace() and (user_id = auth.uid() or app_is_admin()));
create policy act_insert on activity_log for insert
  with check (workspace_id = app_workspace());

-- reassignment_log: admin only
create policy rl_admin on reassignment_log for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- templates: shared across workspace
create policy tpl_all on templates for all
  using (workspace_id = app_workspace())
  with check (workspace_id = app_workspace());

-- saved_lists: personal per user
create policy sl_all on saved_lists for all
  using (workspace_id = app_workspace() and created_by = auth.uid())
  with check (workspace_id = app_workspace() and created_by = auth.uid());

-- notifications: only the recipient
create policy ntf_all on notifications for all
  using (workspace_id = app_workspace() and user_id = auth.uid())
  with check (workspace_id = app_workspace() and user_id = auth.uid());

-- collaborations (hidden): workspace-scoped read/write
create policy collab_all on collaborations for all
  using (workspace_id = app_workspace())
  with check (workspace_id = app_workspace());
