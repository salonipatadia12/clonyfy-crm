/**
 * Saved views for the Creators page.
 *
 * Kept in a client-importable module (not `lib/crm.ts`, which is `server-only`)
 * so the page and the API agree on the same list of view keys.
 *
 * `description` is shown under the view title and must describe what the view
 * ACTUALLY selects. "Qualified" used to be the default view while selecting
 * every record that had merely failed to match an organisation keyword; the
 * default is now `candidate`, which claims nothing the data cannot support.
 */
export const CREATOR_VIEWS = [
  {
    key: 'candidate',
    label: 'Candidates',
    description: 'Instagram records with nothing against them. Nobody has confirmed these are individuals rather than companies or feeds — review before treating one as a creator.',
  },
  {
    key: 'qualified',
    label: 'Qualified creators',
    description: 'Confirmed by a person on your team as an individual creator. This view is empty until someone reviews a record.',
  },
  {
    key: 'needs_class',
    label: 'Needs review',
    description: 'Classified as an organisation, brand, institution, government account, publisher or feed — or missing the follower count or niche needed to judge it.',
  },
  {
    key: 'us',
    label: 'Confirmed / likely US',
    description: 'Geography backed by a real location string or an explicit marker from the source — not just a country tag.',
  },
  {
    key: 'email',
    label: 'Email available',
    description: 'A public email address is recorded.',
  },
  {
    key: 'phone',
    label: 'Phone available',
    description: 'A public phone number is recorded. Optional — phone is never required for outreach.',
  },
  {
    key: 'needs_contact',
    label: 'Needs contact enrichment',
    description: 'No email and no phone yet. Instagram DM may still be possible.',
  },
  {
    key: 'awaiting',
    label: 'Awaiting Instagram verification',
    description: 'Found contact-first; the Instagram profile has not been scraped, so follower counts and niches are provisional.',
  },
  {
    key: 'in_campaigns',
    label: 'Already used in campaigns',
    description: 'Appears in at least one campaign. Useful for repeat collaborations and for avoiding conflicts.',
  },
  {
    key: 'all',
    label: 'All records',
    description: 'Every record in the catalog, including ones that still need review.',
  },
] as const

export type CreatorViewKey = (typeof CREATOR_VIEWS)[number]['key']

/** The view the Creators page opens on. */
export const DEFAULT_CREATOR_VIEW: CreatorViewKey = 'candidate'
