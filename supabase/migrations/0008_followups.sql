-- Scheduled next follow-up date for a pipeline contact. Surfaced on read (no
-- cron): a dashboard "Follow-ups due" widget shows rows due today or earlier.
alter table pipeline add column if not exists next_follow_up date;
create index if not exists pipeline_ws_followup on pipeline (workspace_id, next_follow_up);
