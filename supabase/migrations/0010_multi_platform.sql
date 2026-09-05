-- Multi-platform sourcing (2026-09-02).
--
-- The catalog was Instagram-only: `handle` was assumed to be an IG handle and
-- uniqueness was (workspace_id, handle). Sourcing from YouTube/GitHub/Bluesky
-- breaks that — a GitHub username and an Instagram handle can be the same
-- string for different people.
--
-- Adds an explicit platform, widens the unique key to include it, and records
-- where a row came from so we can judge source quality later.

alter table influencers
  add column if not exists platform    text not null default 'instagram',
  add column if not exists source      text,           -- e.g. 'github:search', 'youtube:search'
  add column if not exists external_id text,           -- stable platform id (channelId, GitHub id)
  add column if not exists location    text;           -- raw geo string from the platform

-- Only these platforms, so typos can't silently create a new namespace.
alter table influencers drop constraint if exists influencers_platform_check;
alter table influencers add constraint influencers_platform_check
  check (platform in ('instagram', 'youtube', 'github', 'bluesky', 'devto', 'other'));

-- Uniqueness is per platform now.
alter table influencers drop constraint if exists influencers_workspace_id_handle_key;
create unique index if not exists influencers_workspace_platform_handle_key
  on influencers (workspace_id, platform, handle);

create index if not exists influencers_platform_idx on influencers (workspace_id, platform);

-- Pipeline rows mirror the creator's platform so the UI can badge them.
alter table pipeline
  add column if not exists platform text not null default 'instagram';
