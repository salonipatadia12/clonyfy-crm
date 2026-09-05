-- Clonify CRM — simplify the campaign relationship (2026-09-05).
--
-- The eleven-stage ladder modelled a full agency workflow. The product only
-- needs to answer: was this influencer contacted, and did they respond. Five
-- statuses say that; eleven made the user classify work they were not doing.
--
--   suggested / shortlisted / ready_to_contact  -> not_contacted
--   contacted                                   -> contacted
--   replied                                     -> replied
--   negotiating / agreed / content_in_progress
--     / live / completed                        -> interested
--   rejected                                    -> declined
--
-- Existing rows are mapped, not dropped. Nothing outside campaign_creators is
-- touched, and no influencer row is read or written by this migration.

-- The channel actually used, so the drawer can say "Emailed 3 days ago" rather
-- than making the user open the outreach log to find out.
alter table campaign_creators
  add column if not exists outreach_channel text,
  -- Kept alongside `last_touch` so the simple UI has a plain date to show and
  -- edit without reasoning about timezones.
  add column if not exists last_contacted_on date;

alter table campaign_creators drop constraint if exists campaign_creators_channel_check;
alter table campaign_creators add constraint campaign_creators_channel_check
  check (outreach_channel is null or outreach_channel in ('instagram_dm', 'email', 'phone'));

-- Backfill the channel and date from the outreach log that already exists, so
-- no information is invented and none is lost.
update campaign_creators cc
   set outreach_channel = latest.channel,
       last_contacted_on = latest.occurred_at::date
  from (
    select distinct on (campaign_creator_id)
           campaign_creator_id, channel, occurred_at
      from outreach_activities
     where direction = 'outbound'
     order by campaign_creator_id, occurred_at desc
  ) latest
 where latest.campaign_creator_id = cc.id
   and cc.outreach_channel is null;

update campaign_creators
   set last_contacted_on = last_touch::date
 where last_contacted_on is null and last_touch is not null
   and stage <> 'suggested';

-- Map the ladder onto the five statuses. The constraint is dropped first so the
-- update cannot fail against the old check.
alter table campaign_creators drop constraint if exists campaign_creators_stage_check;

update campaign_creators set stage = case stage
  when 'suggested'           then 'not_contacted'
  when 'shortlisted'         then 'not_contacted'
  when 'ready_to_contact'    then 'not_contacted'
  when 'contacted'           then 'contacted'
  when 'replied'             then 'replied'
  when 'negotiating'         then 'interested'
  when 'agreed'              then 'interested'
  when 'content_in_progress' then 'interested'
  when 'live'                then 'interested'
  when 'completed'           then 'interested'
  when 'rejected'            then 'declined'
  else stage
end;

alter table campaign_creators
  alter column stage set default 'not_contacted';

alter table campaign_creators add constraint campaign_creators_stage_check
  check (stage in ('not_contacted', 'contacted', 'replied', 'interested', 'declined'));

create index if not exists cc_ws_stage on campaign_creators (workspace_id, stage);

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
-- The eleven-value constraint can be restored at any time; the mapping is
-- lossy in one direction only (five statuses cannot recover which of the five
-- "interested" stages a row came from), so the pre-migration value of every
-- affected row is available in the backup taken immediately before this ran.
