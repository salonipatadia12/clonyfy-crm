-- Clonify CRM — correct the creator-qualification false positives (2026-09-05).
--
-- THE DEFECT
--
-- 0012 derived `qualification_status` with an `else 'qualified'` fallthrough.
-- Every record that was Instagram-verified, had a follower count and a niche,
-- and had NOT matched an organisation keyword landed in "Qualified creators".
-- Measured on the live catalog before this migration:
--
--     qualified              3138   <- 3138 of them (100%) via the fallthrough
--     needs_review            991
--     cross_platform          453
--     awaiting_verification    14
--
--     qualified x entity_type:  unclassified / unreviewed  = 3138
--
-- Not one qualified record had ever been positively identified as a person.
-- "Qualified" was measuring the absence of a keyword match, not the presence of
-- evidence, so Kennedy Space Center, Google Cloud, BlackRock, NVIDIA AI, Apple
-- Books, NASA Armstrong, Universidad de Antioquia and the French Presidency
-- (Présidence de la République) were all presented to the operator as
-- qualified creators.
--
-- THE CORRECTION
--
-- Absence of evidence becomes its own status. `candidate` means "an Instagram
-- record that nothing disqualifies, and that no one has confirmed is a person".
-- It stays fully usable — searchable, addable to campaigns — but the UI can no
-- longer claim it is qualified.
--
--   qualified      review_state = 'approved', or entity_type =
--                  'individual_creator' AND the record passes the other gates.
--                  Both require a positive human decision.
--   candidate      Instagram, verified, unclassified, has the fields needed to
--                  judge it. Available for work; not asserted as a person.
--   needs_review   classified as an organisation of any kind, or missing the
--                  follower count / niche needed to judge it at all.
--   disqualified   review_state = 'rejected'.
--
-- Nothing here approves anything. The classification pass below only ever moves
-- records TOWARDS review, never towards qualified — a regex is evidence enough
-- to ask a human, never evidence enough to answer for one.

-- ---------------------------------------------------------------------------
-- 1. A wider, honest entity vocabulary
-- ---------------------------------------------------------------------------
alter table influencers
  -- Who decided the entity_type. 'heuristic' can be re-run and overwritten;
  -- 'human' is permanent and must never be overwritten by a backfill.
  add column if not exists entity_source text not null default 'heuristic',
  -- Why the heuristic decided what it decided, shown in the review UI so the
  -- operator can see the evidence rather than trust a label.
  add column if not exists entity_evidence text;

alter table influencers drop constraint if exists influencers_entity_source_check;
alter table influencers add constraint influencers_entity_source_check
  check (entity_source in ('heuristic', 'human'));

alter table influencers drop constraint if exists influencers_entity_type_check;
alter table influencers add constraint influencers_entity_type_check
  check (entity_type in (
    'individual_creator',      -- confirmed person (human decision only)
    'likely_organization',     -- shape of a company, unconfirmed
    'brand',
    'business',
    'institution',
    'government',
    'publisher',
    'aggregator',              -- meme/repost/feed accounts
    'unclassified'             -- not yet judged
  ));

-- ---------------------------------------------------------------------------
-- 2. Audit trail for manual review decisions
-- ---------------------------------------------------------------------------
create table if not exists creator_reviews (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  influencer_id       uuid not null references influencers(id) on delete cascade,
  actor_id            uuid references users(id),
  actor_name          text,
  prev_entity_type    text,
  new_entity_type     text,
  prev_review_state   text,
  new_review_state    text,
  reason              text,
  created_at          timestamptz not null default now()
);
create index if not exists creator_reviews_ws_inf on creator_reviews (workspace_id, influencer_id, created_at desc);
create index if not exists creator_reviews_ws_at  on creator_reviews (workspace_id, created_at desc);

alter table creator_reviews enable row level security;
drop policy if exists creator_reviews_select on creator_reviews;
create policy creator_reviews_select on creator_reviews for select
  using (workspace_id = app_workspace());
drop policy if exists creator_reviews_insert on creator_reviews;
create policy creator_reviews_insert on creator_reviews for insert
  with check (workspace_id = app_workspace());

-- ---------------------------------------------------------------------------
-- 3. Stronger, still-conservative organisation detection
-- ---------------------------------------------------------------------------
-- Only records the heuristic owns are touched, so a human decision made before
-- this migration ran is never overwritten.
--
-- Each branch records its own evidence sentence. These all move a record to
-- "needs review" — a strictly safer position than where it is now.

-- 3a. Government, space agencies, heads of state.
update influencers
   set entity_type = 'government',
       entity_evidence = 'Name or handle matches a government, agency or head-of-state pattern.'
 where entity_source = 'heuristic'
   and entity_type in ('unclassified', 'likely_organization')
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') ~*
       '(\ynasa\y|\yesa\y|\ynoaa\y|\yusgs\y|\ycdc\y|\ynih\y|\yfbi\y|\ycia\y|\yjpl\y|kennedyspace|spacecenter|\ypresidence\y|présidence|\yelysee\y|élysée|whitehouse|white house|\yministry\y|ministère|\ygouv\y|\ygovernment\y|\bgov\.|\yparliament\y|\ysenate\y|\yembassy\y|\ymunicipal|\ycity of\y|\ystate of\y|\ydepartment of\y)';

-- 3b. Named technology and finance corporations, and their sub-brands. This is
--     an explicit list of well-known company names, not a fuzzy shape test:
--     "Google Cloud", "NVIDIA AI", "Microsoft Learn", "Apple Books", "BlackRock".
update influencers
   set entity_type = 'brand',
       entity_evidence = 'Name or handle contains a well-known corporate brand name.'
 where entity_source = 'heuristic'
   and entity_type in ('unclassified', 'likely_organization')
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') ~*
       '(\ygoogle\y|\yalphabet inc|\ydeepmind\y|\ymicrosoft\y|\yapple\y|\yamazon web|\yaws\y|\ynvidia\y|\yintel\y|\yibm\y|\yoracle\y|\ysamsung\y|\yadobe\y|\yphotoshop\y|\yillustrator\y|\ywordpress\y|\yblackrock\y|\yvanguard\y|\ygoldman\y|\ymorgan stanley|\yjpmorgan\y|\ysalesforce\y|\yatlassian\y|\ycloudflare\y|\ydigitalocean\y|\ymongodb\y|\ydocker\y|\ykubernetes\y|\ygithub\y|\ygitlab\y|\yfigma\y|\ycanva\y|\ynotion\y|\yslack\y|\yzoom\y|\ystripe\y|\yshopify\y|\ynetflix\y|\yspotify\y|\ydisney\y|\ymeta\y|\ytiktok\y|\ylinkedin\y|\ydavinciresolve\y|\yunity\y|\yunreal engine\y|\yautodesk\y|\ycisco\y|\yqualcomm\y|\yamd\y|\ytesla\y|\yspacex\y|\yopenai\y|\yanthropic\y)';

-- 3c. Education and culture.
update influencers
   set entity_type = 'institution',
       entity_evidence = 'Name or handle matches a university, school, museum or library pattern.'
 where entity_source = 'heuristic'
   and entity_type in ('unclassified', 'likely_organization')
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') ~*
       '(\yuniversity\y|\yuniversidad\y|\yuniversidade\y|\yuniversit(e|é|à|y)\y|\yuniversia\y|\ycollege\y|\yschool\y|\yescuela\y|\yacademy\y|\yacademia\y|\yinstitute\y|\yinstitut\y|\yinstituto\y|\ymuseum\y|\ymuseo\y|\ymusée\y|\ylibrary\y|\yfoundation\y|\yfundacion\y|\yhospital\y|\yfacult(y|ad)\y)';

-- 3d. Publishers and media outlets.
update influencers
   set entity_type = 'publisher',
       entity_evidence = 'Name or handle matches a news, magazine or publishing pattern.'
 where entity_source = 'heuristic'
   and entity_type in ('unclassified', 'likely_organization')
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') ~*
       '(\ymagazine\y|\ynews\y|\ytimes\y|\ypost\y|\yjournal\y|\ygazette\y|\ytribune\y|\ypublishing\y|\ypublisher\y|\ypress\y|\ybooks\y|\yeditorial\y|\ybbc\y|\ycnn\y|\ycnbc\y|\yforbes\y|\ywired\y|\ytechcrunch\y|\ymashable\y|\yengadget\y|\yverge\y)';

-- 3e. Companies by legal suffix or corporate self-description. Broader than
--     0012: adds a trailing "Inc"/"Ltd", ".com"/".io"/".ai" style names, and
--     first-person-plural bios ("we build", "our platform", "our mission").
update influencers
   set entity_type = 'business',
       entity_evidence = 'Legal suffix, product-domain name, or a bio written in the first person plural.'
 where entity_source = 'heuristic'
   and entity_type in ('unclassified', 'likely_organization')
   and (
     coalesce(full_name, '') || ' ' || coalesce(handle, '') ~*
       '(\yinc\.?$|\yinc\y|\yllc\y|\yltd\y|\ygmbh\y|\ybv\y|\ys\.?a\.?s\.?$|\ycorp\y|\ycorporation\y|\ycompany\y|\yholdings\y|\ygroup\y|\ylabs?\y|\ytechnolog(y|ies)\y|\ysystems\y|\ysolutions\y|\ysoftware\y|\yplatform\y|\ystudios?\y|\yagency\y|\yconsulting\y|\yventures\y|\ycapital\y|\ypartners\y|\.(com|io|ai|co|app|dev|net|org)\y)'
     or coalesce(biography, '') ~*
       '(\bwe (are|build|help|make|offer|provide|create)\b|\bour (team|platform|product|mission|company|software|app)\b|\bcontact (us|our team)\b|\bjoin our\b|\bbook a demo\b|\bfree trial\b)'
   );

-- 3f. Aggregators and topic feeds. The 0012 pass missed the very common
--     "topic-word as a whole name" shape (full_name = "Artificial
--     Intelligence", "Blockchain", "Influencer", "Graphic Designer") — a
--     generic noun with no personal name is a feed, not a person.
update influencers
   set entity_type = 'aggregator',
       entity_evidence = 'Name is a generic topic label rather than a personal name.'
 where entity_source = 'heuristic'
   and entity_type = 'unclassified'
   and coalesce(full_name, '') <> ''
   and full_name !~ '\s'                      -- single word, or…
   and full_name ~* '^(ai|tech|technology|design|coding|code|crypto|blockchain|startup|startups|business|marketing|influencer|developer|programming|software|webdev|ux|ui)$';

update influencers
   set entity_type = 'aggregator',
       entity_evidence = 'Name is a generic topic phrase rather than a personal name.'
 where entity_source = 'heuristic'
   and entity_type = 'unclassified'
   and coalesce(full_name, '') ~*
       '^(artificial intelligence|ai *[|/·-] *artificial intelligence|graphic design(er)?|logo design(er|s)?|web (design(er)?|development)|ui ?/? ?ux( design(er)?)?|digital marketing|social media( marketing)?|startup universe|coding|programming|software (dev|development|engineering)|machine learning|data science|tech news|daily (ai|tech|design|code))\b';

-- 3g. Anything still matching the original 0012 organisation keywords keeps its
--     'likely_organization' label but gains an evidence sentence.
update influencers
   set entity_evidence = 'Matched an organisation keyword in the name, handle or bio.'
 where entity_type = 'likely_organization' and entity_evidence is null;
update influencers
   set entity_evidence = 'Matched a repost / feed / community keyword.'
 where entity_type = 'aggregator' and entity_evidence is null;

-- ---------------------------------------------------------------------------
-- 4. The corrected derived status
-- ---------------------------------------------------------------------------
alter table influencers drop column if exists qualification_status;
alter table influencers add column qualification_status text
  generated always as (
    case
      -- A human decision always wins, in both directions.
      when review_state = 'rejected' then 'disqualified'
      when review_state = 'approved' then 'qualified'
      -- Anything identified as an organisation of any kind needs a human.
      when entity_type in ('likely_organization', 'brand', 'business',
                           'institution', 'government', 'publisher',
                           'aggregator') then 'needs_review'
      -- Records that exist only on another platform.
      when platform <> 'instagram' then 'cross_platform'
      when verification_status = 'pending_instagram_verification' then 'awaiting_verification'
      -- Not enough on the record to judge it at all.
      when follower_count is null or niche is null then 'needs_review'
      -- Positively confirmed as a person and past every gate above.
      when entity_type = 'individual_creator' then 'qualified'
      -- Everything else: usable, unconfirmed, and NOT called qualified.
      else 'candidate'
    end
  ) stored;

alter table influencers drop column if exists profile_completeness;
alter table influencers add column profile_completeness smallint
  generated always as (
    (case when nullif(btrim(coalesce(full_name, '')), '')   is not null then 1 else 0 end) +
    (case when follower_count is not null                               then 1 else 0 end) +
    (case when nullif(btrim(coalesce(niche, '')), '')       is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(biography, '')), '')   is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(profile_url, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(email, '')), '')       is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(phone, '')), '')       is not null then 1 else 0 end) +
    (case when geo_status <> 'unknown'                                  then 1 else 0 end)
  ) stored;

create index if not exists influencers_qualification_idx on influencers (workspace_id, qualification_status);
create index if not exists influencers_entity_type_idx   on influencers (workspace_id, entity_type);

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
-- No source fact is modified: handles, names, follower counts, emails, phones,
-- bios, geography and source evidence are untouched. Only entity_type (which
-- 0012 introduced) is re-graded, and only where entity_source = 'heuristic'.
--
--   To restore the 0012 behaviour:
--     alter table influencers drop column qualification_status;
--     alter table influencers add column qualification_status text
--       generated always as ( ...the 0012 expression... ) stored;
--     update influencers set entity_type = 'unclassified', entity_evidence = null
--      where entity_source = 'heuristic'
--        and entity_type in ('brand','business','institution','government','publisher');
--   creator_reviews may be dropped; it holds only decisions made after this
--   migration and no source data.
