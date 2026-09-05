-- Clonify CRM — additive data-quality layer on the creator catalog (2026-09-05).
--
-- The catalog mixes several sourcing generations and the columns lie about it:
--
--   * `country` holds language codes ('en' x1122, 'fr' x260) next to real
--     geography ('US'/'us' x1018) and 2196 NULLs. Rendering that column as
--     "Country" tells the user 1122 creators live in a country called "en".
--   * The 1018 US rows carry wildly different evidence: geocoded place strings,
--     explicit CONFIRMED_US / US_LIKELY markers, the literal string 'UNKNOWN',
--     and a bare CSV tag with no location at all. One "US" chip flattens that.
--   * Companies, museums, schools and aggregator feeds sit in the same table as
--     individual creators with nothing to tell them apart.
--
-- Nothing here deletes or rewrites a source value except `country`, whose
-- language codes are MOVED (not dropped) into `language_code`. Reversal is
-- documented at the bottom of the file.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table influencers
  -- what kind of account this is. 'unclassified' is the honest default.
  add column if not exists entity_type text not null default 'unclassified',
  -- an explicit human decision, which overrides the heuristic below.
  add column if not exists review_state text not null default 'unreviewed',
  -- geography confidence + the sentence that justifies it.
  add column if not exists geo_status text not null default 'unknown',
  add column if not exists geo_evidence text,
  -- the language code that used to be misfiled in `country`.
  add column if not exists language_code text,
  -- when the record was last confirmed against its source.
  add column if not exists last_verified_at timestamptz;

alter table influencers drop constraint if exists influencers_entity_type_check;
alter table influencers add constraint influencers_entity_type_check
  check (entity_type in (
    'individual_creator',      -- confirmed person
    'likely_organization',     -- heuristic match on company/institution keywords
    'brand',
    'institution',
    'aggregator',              -- meme/repost/feed accounts
    'unclassified'             -- not yet judged
  ));

alter table influencers drop constraint if exists influencers_review_state_check;
alter table influencers add constraint influencers_review_state_check
  check (review_state in ('unreviewed', 'approved', 'rejected'));

alter table influencers drop constraint if exists influencers_geo_status_check;
alter table influencers add constraint influencers_geo_status_check
  check (geo_status in (
    'confirmed_us',   -- geocoded US place string, or an explicit CONFIRMED_US marker
    'likely_us',      -- an explicit US_LIKELY marker from the source
    'unverified_us',  -- tagged US by a country field with no supporting location
    'non_us',         -- location evidence points outside the US
    'unknown'         -- no usable geography at all
  ));

-- ---------------------------------------------------------------------------
-- Backfill: language codes out of `country`
-- ---------------------------------------------------------------------------
-- 'en' and 'fr' in this catalog come from the source's *language* field. They
-- are preserved in language_code and cleared from country so no view can render
-- them as geography.
update influencers
   set language_code = lower(country),
       country       = null,
       geo_evidence  = coalesce(geo_evidence,
         'Source recorded "' || country || '" in the country field; that is a language code, not geography.')
 where country is not null
   and lower(btrim(country)) in ('en', 'fr')
   and language_code is null;

-- ---------------------------------------------------------------------------
-- Backfill: honest geography confidence
-- ---------------------------------------------------------------------------
-- Strongest evidence first; each branch records why it decided what it decided.

-- 1. Explicit confirmation markers written by the sourcing pipeline.
update influencers
   set geo_status   = 'confirmed_us',
       geo_evidence = 'Sourcing pipeline marked this record ' || location || '.'
 where geo_status = 'unknown'
   and upper(btrim(coalesce(location, ''))) in ('CONFIRMED_US', 'US_CONFIRMED');

update influencers
   set geo_status   = 'likely_us',
       geo_evidence = 'Sourcing pipeline marked this record US_LIKELY.'
 where geo_status = 'unknown'
   and upper(btrim(coalesce(location, ''))) = 'US_LIKELY';

-- 2. A real place string that names the United States.
update influencers
   set geo_status   = 'confirmed_us',
       geo_evidence = 'Profile location reads "' || location || '".'
 where geo_status = 'unknown'
   and location is not null
   and upper(btrim(location)) not in ('UNKNOWN', 'US', 'CONFIRMED_US', 'US_CONFIRMED', 'US_LIKELY')
   and location ~* '(\yusa\y|united states|\yu\.s\.a?\y)';

-- 3. A real place string that names a US state or well-known US city, without
--    naming another country.
update influencers
   set geo_status   = 'likely_us',
       geo_evidence = 'Profile location reads "' || location || '", which looks like a US place but does not name the country.'
 where geo_status = 'unknown'
   and location is not null
   and upper(btrim(location)) not in ('UNKNOWN', 'US', 'CONFIRMED_US', 'US_CONFIRMED', 'US_LIKELY')
   and location ~* '(,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\y|\y(New York|Los Angeles|San Francisco|Seattle|Austin|Boston|Chicago|Denver|Miami|Atlanta|Portland|California|Texas|Florida)\y)';

-- 4. A real place string that names no US signal at all.
update influencers
   set geo_status   = 'non_us',
       geo_evidence = 'Profile location reads "' || location || '", which contains no United States signal.'
 where geo_status = 'unknown'
   and location is not null
   and upper(btrim(location)) not in ('UNKNOWN', 'US', 'CONFIRMED_US', 'US_CONFIRMED', 'US_LIKELY');

-- 5. Country field says US but nothing supports it.
update influencers
   set geo_status   = 'unverified_us',
       geo_evidence = 'Tagged US by the source''s country field only — no location evidence on the record.'
 where geo_status = 'unknown'
   and lower(btrim(coalesce(country, ''))) in ('us', 'usa', 'united states');

-- 6. Anything else stays 'unknown'. Record why, so the UI never has to guess.
update influencers
   set geo_evidence = coalesce(geo_evidence, 'No geography recorded on this creator.')
 where geo_status = 'unknown';

-- ---------------------------------------------------------------------------
-- Backfill: conservative entity classification
-- ---------------------------------------------------------------------------
-- This flags candidates for a human. It never promotes anything to
-- 'individual_creator' — only a person can do that, via review_state.
update influencers
   set entity_type = 'likely_organization'
 where entity_type = 'unclassified'
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') || ' ' || coalesce(biography, '')
       ~* '(\yinc\y|\yllc\y|\yltd\y|\ygmbh\y|\ys\.?a\.?r\.?l\y|\yagency\y|\ystudios?\y|\yofficial\y|\ymuseum\y|\yschool\y|\yuniversity\y|\yacademy\y|\yinstitute\y|\yfoundation\y|\ymagazine\y|\ymedia group\y|\ycompany\y|\yco\.\y|\yhq\y|\yconsulting\y|\ysolutions\y|\ytechnologies\y|\ylaborator(y|ies)\y)';

-- Repost / feed / aggregator accounts, which are not creators either.
update influencers
   set entity_type = 'aggregator'
 where entity_type = 'unclassified'
   and coalesce(full_name, '') || ' ' || coalesce(handle, '') || ' ' || coalesce(biography, '')
       ~* '(\ydaily\y|\yfeed\y|\yrepost\y|\ycurated\y|\ybest of\y|\ycommunity\y|\ymemes?\y|\yinspiration\y)';

-- ---------------------------------------------------------------------------
-- Derived columns
-- ---------------------------------------------------------------------------
-- Qualification is DERIVED so it can never drift from the columns it describes.
-- An explicit human review always wins; otherwise a creator is "qualified" only
-- when it is an Instagram-verified individual-shaped record with the fields an
-- operator needs to judge it.
alter table influencers drop column if exists qualification_status;
alter table influencers add column qualification_status text
  generated always as (
    case
      when review_state = 'approved' then 'qualified'
      when review_state = 'rejected' then 'disqualified'
      when entity_type in ('likely_organization', 'brand', 'institution', 'aggregator') then 'needs_review'
      when platform <> 'instagram' then 'cross_platform'
      when verification_status = 'pending_instagram_verification' then 'awaiting_verification'
      when follower_count is null or niche is null then 'needs_review'
      else 'qualified'
    end
  ) stored;

-- How much of the record is actually filled in (0-8). Drives the "profile
-- completeness" indicator without anyone hand-maintaining a number.
alter table influencers drop column if exists profile_completeness;
alter table influencers add column profile_completeness smallint
  generated always as (
    (case when nullif(btrim(coalesce(full_name, '')), '')  is not null then 1 else 0 end) +
    (case when follower_count is not null                              then 1 else 0 end) +
    (case when nullif(btrim(coalesce(niche, '')), '')      is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(biography, '')), '')  is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(profile_url, '')), '')is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(email, '')), '')      is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(phone, '')), '')      is not null then 1 else 0 end) +
    (case when geo_status <> 'unknown'                                 then 1 else 0 end)
  ) stored;

-- The catalog was last confirmed when it was last scraped. Nothing better is
-- known, and inventing a date would be a lie.
update influencers set last_verified_at = scraped_at where last_verified_at is null;

create index if not exists influencers_geo_status_idx    on influencers (workspace_id, geo_status);
create index if not exists influencers_entity_type_idx   on influencers (workspace_id, entity_type);
create index if not exists influencers_qualification_idx on influencers (workspace_id, qualification_status);

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
-- This migration is reversible without data loss:
--
--   update influencers set country = upper(language_code)
--    where language_code is not null and country is null;
--   alter table influencers
--     drop column qualification_status, drop column profile_completeness,
--     drop column entity_type, drop column review_state, drop column geo_status,
--     drop column geo_evidence, drop column language_code, drop column last_verified_at;
--
-- No source column is dropped and no row is deleted by this file.
