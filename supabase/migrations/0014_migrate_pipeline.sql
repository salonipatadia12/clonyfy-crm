-- Clonify CRM — carry existing pipeline / deal work into the campaign model.
--
-- SAFETY: this file only INSERTs. `pipeline`, `deals` and `deal_videos` are left
-- exactly as they are, so the old data stays readable and this migration can be
-- re-run without duplicating anything (every insert has a NOT EXISTS guard or an
-- ON CONFLICT DO NOTHING).
--
-- At the time of writing the live workspace has 0 pipeline rows and 0 deals, so
-- this is a no-op there. It is written for correctness against any workspace
-- that does have rows.

-- ---------------------------------------------------------------------------
-- 1. Every pipeline row needs a campaign to belong to.
-- ---------------------------------------------------------------------------
-- Rows already tagged with a campaign (migration 0009) keep it. Untagged rows
-- go into a per-workspace holding campaign so nothing is stranded — it is a real
-- campaign the user can rename, split or archive, not a hidden bucket.
insert into campaigns (workspace_id, name, client, brief, status, created_at)
select distinct p.workspace_id,
       'Unassigned pipeline (migrated)',
       null,
       'Created by migration 0014 to hold pipeline rows that predated the client/product campaign model. Rename, split or archive this campaign once its creators have been placed.',
       'active',
       now()
  from pipeline p
 where p.campaign_id is null
   and not exists (
     select 1 from campaigns c
      where c.workspace_id = p.workspace_id
        and c.name = 'Unassigned pipeline (migrated)'
   );

-- ---------------------------------------------------------------------------
-- 2. pipeline -> campaign_creators
-- ---------------------------------------------------------------------------
-- The old 8 stages map onto the new 11. 'closed' meant "they agreed"; 'live'
-- and 'completed' carry over directly. 'archived' becomes 'rejected', which is
-- the archive stage in the new board.
insert into campaign_creators (
  workspace_id, campaign_id, influencer_id, handle, stage, owner_id,
  next_follow_up, last_touch, notes, source, added_by, added_at
)
select p.workspace_id,
       coalesce(p.campaign_id, holding.id),
       i.id,
       p.handle,
       case p.stage
         when 'prospecting' then 'shortlisted'
         when 'contacted'   then 'contacted'
         when 'responded'   then 'replied'
         when 'negotiating' then 'negotiating'
         when 'closed'      then 'agreed'
         when 'live'        then 'live'
         when 'completed'   then 'completed'
         when 'archived'    then 'rejected'
         else 'shortlisted'
       end,
       p.assigned_to,
       p.next_follow_up,
       p.last_touch,
       p.notes,
       'migrated_pipeline',
       p.assigned_by,
       p.added_at
  from pipeline p
  join influencers i
    on i.workspace_id = p.workspace_id
   and i.handle = p.handle
  left join campaigns holding
    on holding.workspace_id = p.workspace_id
   and holding.name = 'Unassigned pipeline (migrated)'
 where coalesce(p.campaign_id, holding.id) is not null
on conflict (campaign_id, influencer_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. deals -> offers
-- ---------------------------------------------------------------------------
-- The old deal had no money fields, so nothing financial is invented here:
-- offer_type is 'custom' and every amount stays NULL. `signed_at` becomes an
-- accepted offer with its agreed date; an unsigned deal stays a draft.
insert into offers (
  workspace_id, campaign_creator_id, offer_type, currency, status,
  agreed_at, agreement_url, notes, created_by, created_at
)
select d.workspace_id,
       cc.id,
       'custom',
       'USD',
       case when d.signed_at is not null then 'accepted' else 'draft' end,
       case when d.signed_at is not null then d.signed_at::date else null end,
       d.agreement_url,
       nullif(concat_ws(E'\n',
         nullif(d.title, ''),
         d.notes,
         'Migrated from the legacy deals table (deal ' || d.id || '). No financial terms existed on the source record.'
       ), ''),
       d.created_by,
       d.created_at
  from deals d
  join pipeline p          on p.id = d.pipeline_id
  join campaign_creators cc on cc.workspace_id = d.workspace_id
                          and cc.handle = p.handle
                          and cc.owner_id is not distinct from p.assigned_to
 where not exists (select 1 from offers o where o.campaign_creator_id = cc.id)
on conflict (campaign_creator_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. deal_videos -> deliverables
-- ---------------------------------------------------------------------------
insert into deliverables (
  workspace_id, campaign_creator_id, platform, kind, title, due_date,
  submitted_url, approval_state, published_url, published_at,
  views, likes, comments_count, created_at
)
select dv.workspace_id,
       cc.id,
       coalesce(p.platform, 'instagram'),
       'reel',
       dv.title,
       dv.due_date,
       dv.url,
       case dv.approval_status
         when 'planned'   then 'planned'
         when 'submitted' then 'submitted'
         when 'approved'  then 'approved'
         when 'posted'    then 'published'
         else 'planned'
       end,
       case when dv.approval_status = 'posted' then dv.url else null end,
       dv.posted_at,
       dv.views, dv.likes, dv.comments,
       dv.created_at
  from deal_videos dv
  join deals d              on d.id = dv.deal_id
  join pipeline p           on p.id = d.pipeline_id
  join campaign_creators cc on cc.workspace_id = dv.workspace_id
                          and cc.handle = p.handle
                          and cc.owner_id is not distinct from p.assigned_to
 where not exists (
   select 1 from deliverables x
    where x.campaign_creator_id = cc.id
      and x.created_at = dv.created_at
      and x.title is not distinct from dv.title
 );

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
--   delete from deliverables       where campaign_creator_id in (select id from campaign_creators where source = 'migrated_pipeline');
--   delete from offers             where campaign_creator_id in (select id from campaign_creators where source = 'migrated_pipeline');
--   delete from outreach_activities where campaign_creator_id in (select id from campaign_creators where source = 'migrated_pipeline');
--   delete from campaign_creators  where source = 'migrated_pipeline';
--   delete from campaigns          where name = 'Unassigned pipeline (migrated)';
--
-- The source rows in pipeline/deals/deal_videos are never touched, so a reversal
-- restores the exact prior state.
