-- Soft-hide flag for catalog rows we want out of the browsable list WITHOUT
-- deleting them (reversible). Used to drop fashion designers mis-tagged into the
-- design niche, and available for any future "hide but keep" cleanup.
alter table influencers add column if not exists hidden boolean not null default false;
create index if not exists influencers_ws_hidden on influencers (workspace_id, hidden);
