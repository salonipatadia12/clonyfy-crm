/**
 * The demo scenario, as pure data.
 *
 * Kept separate from scripts/seed-demo.mjs so the seed script is only
 * mechanics (upsert, reconcile, report) and this file is only content. Tests
 * import it to assert shape without touching a database.
 *
 * Every record here is fictional. Websites and emails use `.example`, which is
 * reserved by RFC 2606 and can never resolve or receive mail. Nothing in this
 * file is transmitted anywhere: outreach rows are historical CRM notes about
 * messages that were never sent.
 */

/** Stable identity of the demo run. Re-running the seed reuses this label. */
export const DEMO_LABEL = 'clonify-demo-v1'
export const DEMO_PREFIX = 'DEMO — '

export const CLIENTS = [
  {
    key: 'northstar',
    name: 'DEMO — Northstar Labs',
    website: 'https://northstar-labs.example',
    primary_contact: 'Rae Whitfield (fictional)',
    contact_email: 'rae.whitfield@northstar-labs.example',
    status: 'active',
    notes: 'Fictional client used for product demonstration. Seed-stage productivity software company. No real contract, contact or spend.',
  },
  {
    key: 'canvasco',
    name: 'DEMO — Canvas & Co.',
    website: 'https://canvas-and-co.example',
    primary_contact: 'Ibrahim Osei (fictional)',
    contact_email: 'partnerships@canvas-and-co.example',
    status: 'active',
    notes: 'Fictional client used for product demonstration. Sells physical kit to design educators. No real contract, contact or spend.',
  },
  {
    key: 'launchcart',
    name: 'DEMO — LaunchCart',
    website: 'https://launchcart.example',
    primary_contact: 'Wen Zhao (fictional)',
    contact_email: 'creators@launchcart.example',
    status: 'active',
    notes: 'Fictional client used for product demonstration. E-commerce platform running an always-on partner programme. No real contract, contact or spend.',
  },
]

export const PRODUCTS = [
  {
    key: 'focusflow',
    client: 'northstar',
    name: 'FocusFlow AI',
    product_url: 'https://northstar-labs.example/focusflow',
    category: 'Productivity software',
    description: 'A focus timer that reads your calendar and drafts the day for you. Fictional product for demonstration.',
    target_customer: 'Independent developers, designers and technical founders who plan their own week.',
    selling_points: ['Drafts tomorrow from today’s calendar', 'Works offline', 'No meeting-bot in your calls'],
    price_note: '$12/mo · 30-day trial (fictional)',
    talking_points: ['Show the morning plan being generated', 'Say plainly that it is a paid tool'],
    prohibited_claims: 'Do not claim measured productivity gains. No numbers exist to support one.',
  },
  {
    key: 'studiokit',
    client: 'canvasco',
    name: 'Creator Studio Kit',
    product_url: 'https://canvas-and-co.example/studio-kit',
    category: 'Physical product',
    description: 'A desk kit of colour cards, grid pads and a stand, aimed at people who teach design. Fictional product for demonstration.',
    target_customer: 'Design educators, bootcamp instructors and people who post teaching content.',
    selling_points: ['Ships flat', 'Refill packs', 'Photographs well on camera'],
    price_note: '$89 one-off (fictional)',
    talking_points: ['Unbox on camera', 'Show it in an actual teaching setup'],
    prohibited_claims: 'Do not describe the materials as recycled. They are not.',
  },
  {
    key: 'commerce',
    client: 'launchcart',
    name: 'LaunchCart Commerce Platform',
    product_url: 'https://launchcart.example/platform',
    category: 'E-commerce SaaS',
    description: 'Storefront and checkout for small sellers. Fictional product for demonstration.',
    target_customer: 'Small sellers, online-business creators and people who teach e-commerce.',
    selling_points: ['Checkout in a weekend', 'Flat pricing', 'Migration help'],
    price_note: 'From $29/mo (fictional)',
    talking_points: ['Build a store live', 'Be explicit that this is a paid partnership'],
    prohibited_claims: 'Do not quote earnings, revenue or income figures of any kind.',
  },
]

export const CAMPAIGNS = [
  {
    key: 'focusflow_us',
    name: 'DEMO — FocusFlow US Creator Launch',
    client: 'northstar', product: 'focusflow',
    status: 'active',
    objective: 'awareness',
    objective_note: 'Get FocusFlow in front of US developer and designer audiences ahead of the public launch.',
    startOffset: -24, endOffset: 20,
    brief_niches: ['software_dev', 'technology', 'web_dev'],
    brief_min_followers: 15000, brief_max_followers: 400000,
    brief_geo: 'us_only', brief_platforms: ['instagram'],
    brief_entity_types: ['individual_creator'], brief_contact_pref: 'any',
    brief_creator_target: 12,
    brief_exclusions: 'No accounts that also promote competing focus or time-tracking apps.',
    brief_notes: 'Demo campaign. Prefer creators who talk about how they actually work, not tool-review channels.',
    offer_type: 'flat_fee', offer_flat_fee: 850, offer_currency: 'USD', budget_total: 12000,
    deliverable_plan: [{ kind: 'reel', count: 1 }, { kind: 'story', count: 3 }],
    usage_rights: '90 days paid social, fictional terms.',
    approval_required: true, whitelisting: false,
    cta: 'Link in bio for the 30-day trial',
    discount_code: 'DEMOFLOW30', tracking_url: 'https://northstar-labs.example/r/demo',
    hashtags: ['ad', 'focusflow'],
    disclosure_required: 'Paid partnership label required on every post.',
    talking_points: ['Show the morning plan', 'Do not claim measured productivity gains'],
  },
  {
    key: 'studio_beta',
    name: 'DEMO — Creator Studio Educator Beta',
    client: 'canvasco', product: 'studiokit',
    status: 'planning',
    objective: 'ugc',
    objective_note: 'Put the kit in the hands of people who teach design and see what they do with it.',
    startOffset: 12, endOffset: 70,
    brief_niches: ['design'],
    brief_min_followers: 8000, brief_max_followers: 150000,
    brief_geo: 'us_preferred', brief_platforms: ['instagram'],
    brief_entity_types: ['individual_creator'], brief_contact_pref: 'email',
    brief_creator_target: 8,
    brief_exclusions: 'No accounts that only repost other people’s work.',
    brief_notes: 'Demo campaign, still being planned. Gifted only — no fee budget approved yet.',
    offer_type: 'gifted', offer_gifted_product: 'Creator Studio Kit + one refill pack',
    offer_currency: 'USD', budget_total: null,
    deliverable_plan: [{ kind: 'post', count: 1 }, { kind: 'story', count: 2 }],
    usage_rights: 'Organic only, fictional terms.',
    approval_required: true, whitelisting: false,
    cta: 'Swipe up for the educator bundle',
    hashtags: ['gifted'],
    disclosure_required: 'Gifted label required.',
    talking_points: ['Unbox on camera', 'Show it in a real teaching setup'],
  },
  {
    key: 'partner_push',
    name: 'DEMO — LaunchCart Partner Push',
    client: 'launchcart', product: 'commerce',
    status: 'active',
    objective: 'sales',
    objective_note: 'Recruit e-commerce creators onto the affiliate programme before Q4.',
    // Deliberately at risk: the window closes in a week and most of the roster
    // has not replied. This is what "at risk" is supposed to look like on Today.
    startOffset: -40, endOffset: 7,
    brief_niches: ['online_business', 'digital_marketing', 'business_entrepreneurship'],
    brief_min_followers: 20000, brief_max_followers: 500000,
    brief_geo: 'us_preferred', brief_platforms: ['instagram'],
    brief_entity_types: ['individual_creator'], brief_contact_pref: 'any',
    brief_creator_target: 15,
    brief_exclusions: 'No accounts posting income screenshots or earnings claims.',
    brief_notes: 'Demo campaign, running behind. Most of the roster has not replied and the window closes in a week.',
    offer_type: 'flat_plus_commission', offer_flat_fee: 400, offer_commission_pct: 12,
    offer_currency: 'USD', budget_total: 9000,
    deliverable_plan: [{ kind: 'reel', count: 1 }, { kind: 'other', count: 1 }],
    usage_rights: '30 days organic, fictional terms.',
    approval_required: false, whitelisting: true,
    cta: 'Use the code at checkout',
    discount_code: 'DEMOCART', tracking_url: 'https://launchcart.example/r/demo',
    hashtags: ['ad', 'launchcart'],
    disclosure_required: 'Affiliate disclosure required in caption.',
    talking_points: ['Build a store live', 'No earnings claims'],
  },
  {
    key: 'summer_sprint',
    name: 'DEMO — LaunchCart Summer Sprint',
    client: 'launchcart', product: 'commerce',
    status: 'completed',
    objective: 'awareness',
    objective_note: 'Closed campaign, kept so completed work and published deliverables are visible.',
    startOffset: -140, endOffset: -35,
    brief_niches: ['online_business', 'digital_marketing'],
    brief_min_followers: 10000, brief_max_followers: 300000,
    brief_geo: 'any', brief_platforms: ['instagram'],
    brief_entity_types: ['individual_creator'], brief_contact_pref: 'any',
    brief_creator_target: 6,
    brief_notes: 'Demo campaign, finished. Retained so analytics and deliverable history are not empty.',
    offer_type: 'flat_fee', offer_flat_fee: 600, offer_currency: 'USD', budget_total: 4000,
    deliverable_plan: [{ kind: 'reel', count: 1 }],
    usage_rights: 'Expired, fictional terms.',
    approval_required: true, whitelisting: false,
    cta: 'Link in bio',
    hashtags: ['ad'],
    disclosure_required: 'Paid partnership label required.',
  },
]

/**
 * The roster: how many memberships each campaign gets and at which stages.
 * Stages are listed explicitly rather than randomised so two runs of the seed
 * produce the same board.
 */
export const ROSTER = [
  { campaign: 'focusflow_us', stages: [
    'live', 'live', 'content_in_progress', 'agreed', 'negotiating',
    'replied', 'contacted', 'content_in_progress', 'ready_to_contact', 'shortlisted',
    'suggested', 'rejected',
  ] },
  { campaign: 'studio_beta', stages: [
    'shortlisted', 'shortlisted', 'suggested', 'suggested', 'ready_to_contact', 'suggested',
  ] },
  { campaign: 'partner_push', stages: [
    'contacted', 'contacted', 'contacted', 'replied', 'negotiating',
    'ready_to_contact', 'shortlisted', 'suggested', 'rejected',
  ] },
  { campaign: 'summer_sprint', stages: [
    'completed', 'completed', 'completed', 'live',
  ] },
]

/**
 * Creators deliberately placed in TWO campaigns, to prove that stage, offer,
 * notes and outreach history are per-relationship and not per-creator.
 * Index refers to position in the deterministic candidate pool.
 */
export const SHARED_CREATOR_SLOTS = [
  { a: { campaign: 'focusflow_us', slot: 0 },  b: { campaign: 'partner_push', slot: 0 } },
  { a: { campaign: 'focusflow_us', slot: 3 },  b: { campaign: 'partner_push', slot: 3 } },
  { a: { campaign: 'focusflow_us', slot: 6 },  b: { campaign: 'summer_sprint', slot: 0 } },
  { a: { campaign: 'partner_push', slot: 7 },  b: { campaign: 'studio_beta', slot: 2 } },
]

export const TEMPLATES = [
  {
    key: 'ig_intro', name: 'DEMO — Instagram DM introduction', channel: 'instagram_dm',
    campaign: 'focusflow_us', product: 'focusflow',
    body: `Hi {{first_name}} — I'm {{sender_name}} at {{client}}.\n\nWe're lining up creators for {{campaign}} and your work on {{niche}} is exactly the angle we're after. We'd be sending over {{product}} plus a paid slot.\n\nWould it be useful if I sent the brief? No obligation either way.`,
    follow_ups: [
      { step: 1, delay_days: 4, body: `Hi {{first_name}}, just floating this back up in case it got buried. Happy to send the {{campaign}} brief over whenever suits.` },
    ],
  },
  {
    key: 'ig_followup', name: 'DEMO — Instagram DM follow-up', channel: 'instagram_dm',
    campaign: null, product: null,
    body: `Hi {{first_name}} — following up on {{campaign}}. Still keen to work with you; the slot is open while the campaign runs.\n\nIf it's not for you just say so and I'll stop nudging.`,
    follow_ups: [],
  },
  {
    key: 'email_intro', name: 'DEMO — Email introduction', channel: 'email',
    campaign: 'partner_push', product: 'commerce',
    subject: 'Partnership on {{campaign}} — {{client}}',
    body: `Hi {{first_name}},\n\nI'm {{sender_name}} at {{client}}. We're recruiting creators for {{campaign}}, promoting {{product}}.\n\nWhat we're offering: {{offer}}.\n\nIf that's interesting I'll send the full brief and the rate card. If not, no problem at all — just let me know and I'll take you off the list.\n\n{{sender_name}}`,
    follow_ups: [
      { step: 1, delay_days: 5, subject: 'Re: {{campaign}}', body: `Hi {{first_name}}, checking this reached you. Happy to answer anything about {{product}} before you decide.` },
      { step: 2, delay_days: 12, subject: 'Closing the loop on {{campaign}}', body: `Hi {{first_name}}, last one from me — I'll assume it's a no unless I hear back. Door's open if that changes.` },
    ],
  },
  {
    key: 'email_followup', name: 'DEMO — Email follow-up', channel: 'email',
    campaign: null, product: null,
    subject: 'Following up — {{campaign}}',
    body: `Hi {{first_name}},\n\nFollowing up on {{campaign}}. The brief is still open and I'd rather work with you than fill the slot.\n\nAny questions about {{product}}, just ask.\n\n{{sender_name}}`,
    follow_ups: [],
  },
  {
    key: 'rate_response', name: 'DEMO — Rate-request response', channel: 'email',
    campaign: null, product: null,
    subject: 'Rates for {{campaign}}',
    body: `Hi {{first_name}},\n\nThanks for asking. For {{campaign}} we've budgeted {{offer}} for the deliverables in the brief.\n\nIf your rate sits above that, send it over — I'd rather see your number than guess.\n\n{{sender_name}}`,
    follow_ups: [],
  },
  {
    key: 'deliverable_reminder', name: 'DEMO — Deliverable reminder', channel: 'instagram_dm',
    campaign: null, product: null,
    body: `Hi {{first_name}} — quick reminder that the {{campaign}} content is due shortly. Shout if you need longer, that's completely fine.`,
    follow_ups: [],
  },
]
