-- Signing lifecycle: a deal is "signed" when signed_at is set (orthogonal to
-- status). agreement_url is an optional link to the signed agreement. No money.
alter table deals add column if not exists signed_at     timestamptz;
alter table deals add column if not exists agreement_url text;
create index if not exists deals_ws_signed on deals (workspace_id, signed_at);
