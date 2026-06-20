-- Clonyfy CRM — collaboration (comments/@mentions) + per-rep goals.

-- Teammate comments on a creator (distinct from private pipeline notes).
create table if not exists comments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  influencer_handle text not null,
  author_id         uuid references users(id),
  author_name       text,
  body              text not null,
  mentions          uuid[] default '{}',
  created_at        timestamptz not null default now()
);
create index if not exists comments_ws_handle on comments (workspace_id, influencer_handle, created_at);

alter table comments enable row level security;
create policy cmt_select on comments for select using (workspace_id = app_workspace());
create policy cmt_insert on comments for insert with check (workspace_id = app_workspace() and author_id = auth.uid());
create policy cmt_modify on comments for update using (workspace_id = app_workspace() and author_id = auth.uid());
create policy cmt_delete on comments for delete using (workspace_id = app_workspace() and (author_id = auth.uid() or app_is_admin()));

-- Per-member monthly goal (# of creators advanced to contacted+ per month).
alter table users add column if not exists monthly_goal integer not null default 0;
