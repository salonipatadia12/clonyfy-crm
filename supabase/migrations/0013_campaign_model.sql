-- Clonify CRM — client / product / campaign-creator model (2026-09-05).
--
-- The defect this fixes: `pipeline` is keyed unique(workspace_id, handle,
-- assigned_to) and carries ONE `stage`. Migration 0009 bolted `campaign_id`
-- onto that row, which means a creator can belong to one campaign at a time and
-- moving them for Client A moves them for Client B.
--
-- The relationship — not the creator — is what has a stage, an owner, a match
-- score, an offer, a follow-up date and deliverables. `campaign_creators` is
-- that relationship. `pipeline` and `deals` are left untouched; 0014 copies
-- their rows forward.

-- ---------------------------------------------------------------------------
-- Clients and their products
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,
  website         text,
  primary_contact text,
  contact_email   text,
  notes           text,
  status          text not null default 'active' check (status in ('active','paused','archived')),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists clients_ws on clients (workspace_id, status);

create table if not exists products (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,
  name               text not null,
  product_url        text,
  category           text,
  description        text,
  target_customer    text,
  selling_points     text[],
  price_note         text,            -- free text: "$49/mo", "20% launch offer"
  prohibited_claims  text,
  talking_points     text[],
  asset_links        text[],
  status             text not null default 'active' check (status in ('active','paused','archived')),
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, client_id, name)
);
create index if not exists products_ws on products (workspace_id, client_id, status);

-- ---------------------------------------------------------------------------
-- Campaigns: extend the 0009 table rather than replacing it
-- ---------------------------------------------------------------------------
alter table campaigns
  add column if not exists client_id           uuid references clients(id) on delete set null,
  add column if not exists product_id          uuid references products(id) on delete set null,
  add column if not exists owner_id            uuid references users(id),
  add column if not exists objective            text,
  add column if not exists objective_note       text,
  -- creator brief
  add column if not exists brief_niches         text[],
  add column if not exists brief_min_followers  bigint,
  add column if not exists brief_max_followers  bigint,
  add column if not exists brief_geo            text,          -- 'us_only' | 'us_preferred' | 'any'
  add column if not exists brief_platforms      text[],
  add column if not exists brief_entity_types   text[],
  add column if not exists brief_contact_pref   text,          -- 'any' | 'email' | 'instagram' | 'phone'
  add column if not exists brief_creator_target integer,
  add column if not exists brief_exclusions     text,
  add column if not exists brief_notes          text,
  -- default offer shape for the campaign
  add column if not exists offer_type           text,
  add column if not exists offer_flat_fee       numeric,
  add column if not exists offer_commission_pct numeric,
  add column if not exists offer_gifted_product text,
  add column if not exists offer_currency       text default 'USD',
  add column if not exists budget_total         numeric,
  -- default deliverable shape
  add column if not exists deliverable_plan     jsonb default '[]'::jsonb,
  add column if not exists usage_rights         text,
  add column if not exists whitelisting         boolean not null default false,
  add column if not exists approval_required    boolean not null default true,
  -- messaging + tracking
  add column if not exists talking_points       text[],
  add column if not exists cta                  text,
  add column if not exists discount_code        text,
  add column if not exists tracking_url         text,
  add column if not exists hashtags             text[],
  add column if not exists disclosure_required  text,
  add column if not exists prohibited_language  text;

alter table campaigns drop constraint if exists campaigns_objective_check;
alter table campaigns add constraint campaigns_objective_check
  check (objective is null or objective in
    ('awareness','traffic','leads','sales','ugc','product_launch','custom'));

alter table campaigns drop constraint if exists campaigns_brief_geo_check;
alter table campaigns add constraint campaigns_brief_geo_check
  check (brief_geo is null or brief_geo in ('us_only','us_preferred','any'));

alter table campaigns drop constraint if exists campaigns_offer_type_check;
alter table campaigns add constraint campaigns_offer_type_check
  check (offer_type is null or offer_type in
    ('gifted','flat_fee','commission','flat_plus_commission','custom'));

create index if not exists campaigns_client  on campaigns (workspace_id, client_id);
create index if not exists campaigns_product on campaigns (workspace_id, product_id);

-- ---------------------------------------------------------------------------
-- campaign_creators — THE relationship. One row per (campaign, creator).
-- ---------------------------------------------------------------------------
create table if not exists campaign_creators (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  influencer_id   uuid not null references influencers(id) on delete cascade,
  handle          text not null,          -- denormalised for display + activity joins
  -- stage belongs to the RELATIONSHIP, never to the creator.
  stage           text not null default 'suggested',
  owner_id        uuid references users(id),
  -- match_score is arithmetic over stored fields (see lib/match.ts). It is not a
  -- prediction and match_reasons carries the facts that produced it.
  match_score     integer,
  match_reasons   jsonb not null default '[]'::jsonb,
  next_follow_up  date,
  last_touch      timestamptz,
  notes           text,
  source          text,                   -- 'search' | 'suggested' | 'bulk' | 'import'
  added_by        uuid references users(id),
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a creator appears at most once per campaign, and any number of times across
  -- campaigns. This is the constraint that makes multi-campaign membership work.
  unique (campaign_id, influencer_id)
);

alter table campaign_creators drop constraint if exists campaign_creators_stage_check;
alter table campaign_creators add constraint campaign_creators_stage_check
  check (stage in ('suggested','shortlisted','ready_to_contact','contacted','replied',
                   'negotiating','agreed','content_in_progress','live','completed','rejected'));

create index if not exists cc_ws_campaign  on campaign_creators (workspace_id, campaign_id, stage);
create index if not exists cc_ws_influencer on campaign_creators (workspace_id, influencer_id);
create index if not exists cc_ws_owner     on campaign_creators (workspace_id, owner_id);
create index if not exists cc_ws_followup  on campaign_creators (workspace_id, next_follow_up);

-- ---------------------------------------------------------------------------
-- outreach_activities — what a human actually did, per relationship
-- ---------------------------------------------------------------------------
-- Nothing in this application sends a message. These rows record manual work.
create table if not exists outreach_activities (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  campaign_creator_id  uuid not null references campaign_creators(id) on delete cascade,
  channel              text not null check (channel in ('instagram_dm','email','phone','whatsapp','other')),
  direction            text not null default 'outbound' check (direction in ('outbound','inbound')),
  template_id          uuid references templates(id) on delete set null,
  subject              text,
  body                 text,
  occurred_at          timestamptz not null default now(),
  reply_status         text not null default 'none'
                         check (reply_status in ('none','awaiting','replied_positive','replied_negative','bounced')),
  next_follow_up       date,
  notes                text,
  logged_by            uuid references users(id),
  created_at           timestamptz not null default now()
);
create index if not exists oa_ws_cc   on outreach_activities (workspace_id, campaign_creator_id, occurred_at desc);
create index if not exists oa_ws_time on outreach_activities (workspace_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- offers — the collaboration terms for one relationship
-- ---------------------------------------------------------------------------
-- Money columns are intentional. The earlier "no $ in the CRM" rule described a
-- different product; this build has to budget campaigns and track what a creator
-- was actually offered. No value is backfilled onto an existing record.
create table if not exists offers (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  campaign_creator_id uuid not null references campaign_creators(id) on delete cascade,
  offer_type          text not null default 'gifted'
                        check (offer_type in ('gifted','flat_fee','commission','flat_plus_commission','custom')),
  flat_fee            numeric,
  commission_pct      numeric,
  gifted_product      text,
  currency            text not null default 'USD',
  status              text not null default 'draft'
                        check (status in ('draft','sent','counter_offered','accepted','declined','withdrawn')),
  agreed_at           date,
  agreement_url       text,
  usage_rights        text,
  exclusivity         text,
  whitelisting        boolean not null default false,
  notes               text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (campaign_creator_id)
);
create index if not exists offers_ws on offers (workspace_id, status);

-- ---------------------------------------------------------------------------
-- deliverables — many per relationship
-- ---------------------------------------------------------------------------
create table if not exists deliverables (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  campaign_creator_id uuid not null references campaign_creators(id) on delete cascade,
  platform            text not null default 'instagram',
  kind                text not null default 'reel'
                        check (kind in ('reel','post','story','video','short','livestream','ugc_asset','other')),
  title               text,
  brief               text,
  due_date            date,
  submitted_url       text,
  submitted_at        timestamptz,
  approval_state      text not null default 'planned'
                        check (approval_state in ('planned','submitted','changes_requested','approved','published')),
  feedback            text,
  approved_at         timestamptz,
  published_url       text,
  published_at        date,
  -- performance, entered by hand. NULL means "not recorded", never zero.
  views               bigint,
  likes               bigint,
  comments_count      bigint,
  saves               bigint,
  clicks              bigint,
  conversions         bigint,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists dlv_ws_cc   on deliverables (workspace_id, campaign_creator_id);
create index if not exists dlv_ws_due  on deliverables (workspace_id, due_date) where approval_state <> 'published';
create index if not exists dlv_ws_appr on deliverables (workspace_id, approval_state);

-- ---------------------------------------------------------------------------
-- Templates: channel-aware, campaign-bound, with a follow-up sequence
-- ---------------------------------------------------------------------------
alter table templates
  add column if not exists channel     text not null default 'instagram_dm',
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists product_id  uuid references products(id) on delete set null,
  -- [{ step, delay_days, subject, body }] — the follow-up ladder after the first
  -- message. Stored as jsonb so a sequence can grow without a migration.
  add column if not exists follow_ups  jsonb not null default '[]'::jsonb,
  add column if not exists updated_by  uuid references users(id);

alter table templates drop constraint if exists templates_channel_check;
alter table templates add constraint templates_channel_check
  check (channel in ('instagram_dm','email'));

-- ---------------------------------------------------------------------------
-- RLS — mirrors the existing workspace-isolation model exactly
-- ---------------------------------------------------------------------------
alter table clients             enable row level security;
alter table products            enable row level security;
alter table campaign_creators   enable row level security;
alter table outreach_activities enable row level security;
alter table offers              enable row level security;
alter table deliverables        enable row level security;

-- Clients and products are workspace reference data: everyone reads, admins write.
drop policy if exists clients_select on clients;
create policy clients_select on clients for select using (workspace_id = app_workspace());
drop policy if exists clients_admin_write on clients;
create policy clients_admin_write on clients for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

drop policy if exists products_select on products;
create policy products_select on products for select using (workspace_id = app_workspace());
drop policy if exists products_admin_write on products;
create policy products_admin_write on products for all
  using (workspace_id = app_workspace() and app_is_admin())
  with check (workspace_id = app_workspace() and app_is_admin());

-- campaign_creators follows the pipeline ownership rule it replaces: a member
-- sees and edits the relationships they own; an admin sees the whole workspace.
drop policy if exists cc_select on campaign_creators;
create policy cc_select on campaign_creators for select
  using (workspace_id = app_workspace() and (owner_id = auth.uid() or owner_id is null or app_is_admin()));
drop policy if exists cc_insert on campaign_creators;
create policy cc_insert on campaign_creators for insert
  with check (workspace_id = app_workspace());
drop policy if exists cc_update on campaign_creators;
create policy cc_update on campaign_creators for update
  using (workspace_id = app_workspace() and (owner_id = auth.uid() or owner_id is null or app_is_admin()));
drop policy if exists cc_delete on campaign_creators;
create policy cc_delete on campaign_creators for delete
  using (workspace_id = app_workspace() and (owner_id = auth.uid() or app_is_admin()));

-- Children inherit visibility from their relationship row. The subquery is
-- evaluated under the caller's own RLS, so it cannot leak another owner's rows.
drop policy if exists oa_all on outreach_activities;
create policy oa_all on outreach_activities for all
  using (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators))
  with check (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators));

drop policy if exists offers_all on offers;
create policy offers_all on offers for all
  using (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators))
  with check (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators));

drop policy if exists dlv_all on deliverables;
create policy dlv_all on deliverables for all
  using (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators))
  with check (workspace_id = app_workspace()
     and campaign_creator_id in (select id from campaign_creators));
