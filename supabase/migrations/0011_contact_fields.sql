-- Contact-first sourcing (2026-09-05).
--
-- The catalog could hold an email and nothing else. The US_CONTACT_FIRST
-- campaign's whole premise is that an outreach record needs Instagram + a
-- public email + a public phone, so the phone had nowhere to land.
--
-- Adds the phone, the provenance behind BOTH contact fields (source URL,
-- label, confidence, how it was classified), and a verification flag so a
-- candidate that has not yet been through a paid Instagram scrape can be
-- stored without being passed off as verified data.

alter table influencers
  -- phone, normalised to E.164 by `phonenumbers` before insert
  add column if not exists phone              text,
  add column if not exists phone_original     text,
  add column if not exists phone_type         text,
  add column if not exists phone_source_url   text,
  add column if not exists phone_source_label text,
  add column if not exists phone_confidence   numeric,
  -- matching provenance for the email column that already existed
  add column if not exists email_type         text,
  add column if not exists email_source_url   text,
  add column if not exists email_confidence   numeric,
  -- how the record was found, and how confident we are it is the same person
  add column if not exists discovery_route    text,
  add column if not exists source_anchor      text,
  add column if not exists identity_confidence numeric;

alter table influencers drop constraint if exists influencers_phone_type_check;
alter table influencers add constraint influencers_phone_type_check
  check (phone_type is null or phone_type in
    ('mobile', 'landline', 'business', 'voip', 'toll_free', 'unknown'));

alter table influencers drop constraint if exists influencers_email_type_check;
alter table influencers add constraint influencers_email_type_check
  check (email_type is null or email_type in
    ('named_professional', 'generic_business', 'booking_partnership'));

-- A row sourced contact-first has not necessarily been scraped on Instagram.
-- Without this flag a candidate with no follower count and a provisional niche
-- is indistinguishable in the UI from a fully verified creator.
alter table influencers
  add column if not exists verification_status text not null default 'instagram_verified';

alter table influencers drop constraint if exists influencers_verification_status_check;
alter table influencers add constraint influencers_verification_status_check
  check (verification_status in ('instagram_verified', 'pending_instagram_verification'));

-- Contact completeness is derived, never stored by hand, so it cannot drift
-- out of sync with the columns it describes.
alter table influencers drop column if exists contact_status;
alter table influencers add column contact_status text
  generated always as (
    case
      when nullif(btrim(coalesce(email, '')), '') is not null
       and nullif(btrim(coalesce(phone, '')), '') is not null then 'complete'
      when nullif(btrim(coalesce(email, '')), '') is not null then 'email_only'
      when nullif(btrim(coalesce(phone, '')), '') is not null then 'phone_only'
      else 'none'
    end
  ) stored;

create index if not exists influencers_contact_status_idx
  on influencers (workspace_id, contact_status);
create index if not exists influencers_verification_status_idx
  on influencers (workspace_id, verification_status);

-- Pipeline rows carry the contacts forward so outreach does not have to join
-- back to the catalog mid-conversation.
alter table pipeline
  add column if not exists email text,
  add column if not exists phone text;
