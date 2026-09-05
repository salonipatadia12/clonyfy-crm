-- Deliverable scheduling + content-approval workflow (no payment). Each video
-- moves planned -> submitted -> approved -> posted, with an optional due date.
alter table deal_videos add column if not exists due_date date;
alter table deal_videos add column if not exists approval_status text not null default 'planned'
  check (approval_status in ('planned','submitted','approved','posted'));
-- Existing rows that already have a posted date are, by definition, posted.
update deal_videos set approval_status = 'posted' where posted_at is not null;
-- Find overdue deliverables fast (due but not yet posted).
create index if not exists deal_videos_due on deal_videos (workspace_id, due_date)
  where approval_status <> 'posted';
