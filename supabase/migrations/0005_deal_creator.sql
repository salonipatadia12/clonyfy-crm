-- Track who created a deal, distinct from who owns it (#12). owner_id can change
-- via reassignment; created_by is immutable provenance.
alter table deals add column if not exists created_by uuid references users(id);
-- Backfill existing deals: assume the owner created them.
update deals set created_by = owner_id where created_by is null;
