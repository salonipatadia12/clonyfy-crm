/**
 * Unit tests for the pure logic the redesign depends on.
 *
 * Run with `npm test`. These cover the rules that would silently mislead a user
 * if they regressed: honest geography, honest link labelling, per-channel
 * outreach readiness, explainable matching and template variable resolution.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREATOR_VIEWS, DEFAULT_CREATOR_VIEW } from '../lib/crm-views'
import { VARIABLES } from '../lib/template-vars'
import { CLIENTS, PRODUCTS, CAMPAIGNS, ROSTER, TEMPLATES } from '../scripts/demo-fixture.mjs'
import { DEMO_TABLES_DELETE_ORDER, PROTECTED_TABLES } from '../scripts/demo-common.mjs'

import { scoreMatch, briefFromCampaign, briefIsEmpty, type MatchInput, type MatchBrief } from '../lib/match'
import { renderTemplate, resolveVariables } from '../lib/template-vars'
import { queuesFor } from '../lib/outreach-queues'
import {
  geoLabel, linkLabelFor, isInstagramUrl, channelReadiness, ccStageLabel,
  CC_STAGES, dueLabel, contactLabel, entityLabel, qualificationLabel,
  qualificationHelp, ORGANISATION_ENTITY_TYPES, ENTITY_TONE,
} from '../lib/domain'
import { toggleIn } from '../lib/utils'

const CREATOR: MatchInput = {
  niche: 'web_dev',
  follower_count: 25_000,
  geo_status: 'confirmed_us',
  platform: 'instagram',
  contact_status: 'email_only',
  email: 'hi@example.com',
  phone: null,
  profile_url: 'https://www.instagram.com/someone/',
  entity_type: 'individual_creator',
  qualification_status: 'qualified',
  verification_status: 'instagram_verified',
}

const BRIEF: MatchBrief = {
  niches: ['web_dev'],
  minFollowers: 10_000,
  maxFollowers: 100_000,
  geo: 'us_only',
  platforms: ['instagram'],
  contactPref: 'any',
  entityTypes: null,
}

// ---------------------------------------------------------------------------
// Geography is never a language code
// ---------------------------------------------------------------------------

test('EN and FR are not rendered as countries', () => {
  // Migration 0012 moves 'en'/'fr' out of `country` into `language_code`. The
  // UI renders geo_status, whose vocabulary contains no language codes at all.
  const geoValues = ['confirmed_us', 'likely_us', 'unverified_us', 'non_us', 'unknown']
  for (const v of geoValues) {
    const label = geoLabel(v)
    assert.doesNotMatch(label, /\ben\b|\bfr\b/i, `geo label "${label}" leaked a language code`)
  }
  // An unrecognised value degrades to "unknown", never to the raw string.
  assert.equal(geoLabel('en'), 'Location unknown')
  assert.equal(geoLabel('fr'), 'Location unknown')
  assert.equal(geoLabel(null), 'Location unknown')
})

test('geography labels state their confidence rather than flattening to "US"', () => {
  assert.notEqual(geoLabel('confirmed_us'), geoLabel('unverified_us'))
  assert.match(geoLabel('confirmed_us'), /confirmed/i)
  assert.match(geoLabel('unverified_us'), /unverified/i)
})

// ---------------------------------------------------------------------------
// Links are labelled by the host they point at
// ---------------------------------------------------------------------------

test('platform links are labelled from the URL, not assumed to be Instagram', () => {
  assert.equal(linkLabelFor('https://www.instagram.com/someone/'), 'Instagram')
  assert.equal(linkLabelFor('https://www.youtube.com/channel/UC123'), 'YouTube')
  assert.equal(linkLabelFor('https://github.com/jart'), 'GitHub')
  assert.equal(linkLabelFor('https://linktr.ee/oghvze'), 'Link page')
  assert.equal(linkLabelFor('https://therenderai.com/'), 'therenderai.com')
  assert.equal(linkLabelFor(null), 'Link')
})

test('a YouTube URL is never reported as an Instagram profile', () => {
  assert.equal(isInstagramUrl('https://www.youtube.com/channel/UC123'), false)
  assert.equal(isInstagramUrl('https://www.instagram.com/someone/'), true)
})

// ---------------------------------------------------------------------------
// Outreach readiness is per channel; phone is never a gate
// ---------------------------------------------------------------------------

const ROW = {
  stage: 'shortlisted',
  next_follow_up: null as string | null,
  last_reply_status: null as string | null,
  outreach_count: 0,
  email: null as string | null,
  phone: null as string | null,
  profile_url: null as string | null,
  verification_status: 'instagram_verified' as string | null,
}

test('an Instagram-only creator is outreach ready', () => {
  const q = queuesFor({ ...ROW, profile_url: 'https://www.instagram.com/someone/' })
  assert.ok(q.includes('instagram_ready'))
  assert.ok(!q.includes('missing_contact'), 'having a DM route must not count as missing contact')
})

test('an email-only creator is outreach ready and does not need a phone', () => {
  const q = queuesFor({ ...ROW, email: 'hi@example.com' })
  assert.ok(q.includes('email_ready'))
  assert.ok(!q.includes('phone_available'))
  assert.ok(!q.includes('missing_contact'))
})

test('a phone-only creator is reachable, and phone is additive not exclusive', () => {
  const q = queuesFor({ ...ROW, phone: '+15551234567' })
  assert.deepEqual(q, ['phone_available'])
  const all = queuesFor({ ...ROW, phone: '+1', email: 'a@b.co', profile_url: 'https://www.instagram.com/x/' })
  assert.ok(all.includes('instagram_ready') && all.includes('email_ready') && all.includes('phone_available'))
})

test('only a creator with no channel at all counts as missing contact', () => {
  assert.deepEqual(queuesFor(ROW), ['missing_contact'])
})

test('an unverified Instagram record is not treated as DM-ready', () => {
  const q = queuesFor({
    ...ROW,
    profile_url: 'https://www.instagram.com/someone/',
    verification_status: 'pending_instagram_verification',
  })
  assert.ok(!q.includes('instagram_ready'))
  assert.ok(q.includes('missing_contact'))
})

test('follow-up and reply queues respect the stage', () => {
  const overdue = queuesFor({ ...ROW, stage: 'contacted', next_follow_up: '2020-01-01', outreach_count: 1 }, '2026-09-05')
  assert.ok(overdue.includes('follow_up_due'))
  assert.ok(overdue.includes('awaiting_response'))

  const done = queuesFor({ ...ROW, stage: 'completed', next_follow_up: '2020-01-01', outreach_count: 3 }, '2026-09-05')
  assert.ok(!done.includes('follow_up_due'), 'a completed relationship should not chase follow-ups')
  assert.ok(!done.includes('awaiting_response'))

  const replied = queuesFor({ ...ROW, stage: 'contacted', outreach_count: 1, last_reply_status: 'replied_positive' })
  assert.ok(replied.includes('replied'))
  assert.ok(!replied.includes('awaiting_response'), 'a reply ends the waiting state')
})

test('channelReadiness agrees with the queue logic', () => {
  const r = channelReadiness({ profile_url: 'https://www.instagram.com/x/', email: null, phone: null, verification_status: 'instagram_verified' })
  assert.deepEqual(r, { instagram: true, email: false, phone: false, any: true })
  const none = channelReadiness({ profile_url: null, email: null, phone: null })
  assert.equal(none.any, false)
})

// ---------------------------------------------------------------------------
// Match scoring is explainable and honest
// ---------------------------------------------------------------------------

test('a matching creator scores well and every point has a stated reason', () => {
  const r = scoreMatch(CREATOR, BRIEF)
  assert.ok(r.score !== null && r.score >= 75, `expected a strong score, got ${r.score}`)
  assert.equal(r.blockers.length, 0)
  assert.ok(r.reasons.length >= 4)
  for (const reason of r.reasons) {
    assert.ok(reason.detail.length > 10, 'every reason must carry a human sentence')
    assert.ok(['positive', 'neutral', 'negative'].includes(reason.kind))
  }
})

test('an unknown follower count is reported, not scored as zero followers', () => {
  const r = scoreMatch({ ...CREATOR, follower_count: null }, BRIEF)
  const reason = r.reasons.find(x => /follower count unknown/i.test(x.label))
  assert.ok(reason, 'a missing follower count must produce an explicit reason')
  assert.equal(reason!.points, 0)
})

test('a US-only campaign blocks a creator located outside the US', () => {
  const r = scoreMatch({ ...CREATOR, geo_status: 'non_us' }, BRIEF)
  assert.equal(r.blockers.length, 1)
  assert.match(r.blockers[0].detail, /United States/)
  assert.equal(r.score, 0)
})

test('a US-preferred campaign does not block a non-US creator', () => {
  const r = scoreMatch({ ...CREATOR, geo_status: 'non_us' }, { ...BRIEF, geo: 'us_preferred' })
  assert.equal(r.blockers.length, 0)
  assert.ok(r.score !== null && r.score > 0)
})

test('an email-only campaign blocks a creator with no email', () => {
  const r = scoreMatch({ ...CREATOR, email: null, contact_status: 'none' }, { ...BRIEF, contactPref: 'email' })
  assert.ok(r.blockers.some(b => /email/i.test(b.label)))
})

test('a phone preference is opt-in — the default never blocks on a missing phone', () => {
  const r = scoreMatch({ ...CREATOR, phone: null }, BRIEF)
  assert.equal(r.blockers.length, 0)
})

test('an empty brief yields no score rather than a fake 0%', () => {
  const empty: MatchBrief = {
    niches: null, minFollowers: null, maxFollowers: null,
    geo: null, platforms: null, contactPref: null, entityTypes: null,
  }
  assert.equal(briefIsEmpty(empty), true)
  assert.equal(scoreMatch(CREATOR, empty).score, null)
})

test('an unreviewed organisation record is flagged rather than silently scored', () => {
  const r = scoreMatch({ ...CREATOR, entity_type: 'likely_organization' }, BRIEF)
  assert.ok(r.reasons.some(x => /not confirmed as a person/i.test(x.label)))
})

test('briefFromCampaign reads the campaign columns', () => {
  const b = briefFromCampaign({
    brief_niches: ['design'], brief_min_followers: 1000, brief_max_followers: 5000,
    brief_geo: 'us_only', brief_platforms: ['instagram'], brief_contact_pref: 'email',
    brief_entity_types: ['individual_creator'],
  })
  assert.deepEqual(b.niches, ['design'])
  assert.equal(b.minFollowers, 1000)
  assert.equal(briefIsEmpty(b), false)
})

// ---------------------------------------------------------------------------
// Template variables
// ---------------------------------------------------------------------------

const CTX = {
  campaign: {
    name: 'Acme CLI Q4', client_name: 'Acme', product_name: 'Acme CLI',
    cta: 'Try it free', discount_code: 'CLI20', tracking_url: 'https://acme.dev/r/1',
    offer_type: 'flat_fee', offer_flat_fee: 250, offer_gifted_product: null,
    offer_currency: 'USD', talking_points: ['Ships in one binary'],
  },
  creator: { handle: 'devjane', full_name: 'Jane Doe', follower_count: 12_400, niche: 'web_dev' },
  senderName: 'Sam',
} as unknown as Parameters<typeof renderTemplate>[1]

test('variables resolve from the campaign, product and creator', () => {
  const v = resolveVariables(CTX)
  assert.equal(v.first_name, 'Jane')
  assert.equal(v.handle, 'devjane')
  assert.equal(v.client, 'Acme')
  assert.equal(v.product, 'Acme CLI')
  assert.equal(v.followers, '12.4K')
  assert.equal(v.niche, 'web dev')
  assert.match(v.offer, /250 USD/)
})

test('rendering replaces every token and reports nothing missing when all resolve', () => {
  const r = renderTemplate('Hi {{first_name}}, {{client}} makes {{product}}. {{cta}} with {{discount_code}}.', CTX)
  assert.equal(r.text, 'Hi Jane, Acme makes Acme CLI. Try it free with CLI20.')
  assert.deepEqual(r.missing, [])
})

test('a variable with no value is reported and rendered blank, never left as a raw token', () => {
  const noCode = { ...CTX, campaign: { ...CTX.campaign, discount_code: null } }
  const r = renderTemplate('Use code {{discount_code}} today.', noCode)
  assert.ok(!r.text.includes('{{'), 'a raw token must never reach a message the user copies')
  assert.deepEqual(r.missing, ['discount_code'])
})

test('an unknown variable is reported rather than substituted with something plausible', () => {
  const r = renderTemplate('Hello {{not_a_variable}}', CTX)
  assert.deepEqual(r.missing, ['not_a_variable'])
  assert.equal(r.text, 'Hello ')
})

test('a creator with no full name falls back to the handle, not to an empty greeting', () => {
  const anon = { ...CTX, creator: { ...CTX.creator, full_name: null } }
  assert.equal(resolveVariables(anon).first_name, 'devjane')
})

// ---------------------------------------------------------------------------
// Stage vocabulary
// ---------------------------------------------------------------------------

test('every campaign stage has a human label', () => {
  for (const s of CC_STAGES) {
    const label = ccStageLabel(s)
    assert.notEqual(label, s, `stage ${s} is showing its raw database value`)
    assert.ok(label.length > 2)
  }
})

test('due labels distinguish overdue, today and upcoming', () => {
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(dueLabel(today)!.text, 'Due today')
  assert.equal(dueLabel(null), null)
  const past = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)
  assert.match(dueLabel(past)!.text, /overdue/)
  assert.equal(dueLabel(past)!.tone, 'danger')
})

test('absent data reads as an explicit phrase, never as a plausible value', () => {
  assert.equal(contactLabel(null), 'No public contact')
  assert.equal(entityLabel(null), 'Not yet classified')
  assert.equal(qualificationLabel(null), 'Needs review')
  assert.equal(ccStageLabel(null), '—')
})

test('toggleIn does not mutate the source set', () => {
  const a = new Set(['x'])
  const b = toggleIn(a, 'y')
  assert.deepEqual([...a], ['x'])
  assert.deepEqual([...b].sort(), ['x', 'y'])
  assert.deepEqual([...toggleIn(b, 'x')], ['y'])
})

// ---------------------------------------------------------------------------
// Qualification: absence of evidence is not evidence
// ---------------------------------------------------------------------------

test('the qualification vocabulary distinguishes candidate from qualified', () => {
  // These four are different claims and must never collapse into each other.
  assert.equal(qualificationLabel('qualified'), 'Qualified')
  assert.equal(qualificationLabel('candidate'), 'Candidate')
  assert.equal(qualificationLabel('needs_review'), 'Needs review')
  assert.equal(qualificationLabel('disqualified'), 'Disqualified')
  assert.notEqual(qualificationLabel('candidate'), qualificationLabel('qualified'))
})

test('every qualification status explains what it actually asserts', () => {
  for (const s of ['qualified', 'candidate', 'needs_review', 'cross_platform',
                   'awaiting_verification', 'disqualified']) {
    const help = qualificationHelp(s)
    assert.ok(help.length > 20, `${s} has no explanation`)
  }
  // The candidate wording must not imply anyone confirmed anything.
  assert.match(qualificationHelp('candidate'), /Nobody has confirmed/i)
  assert.match(qualificationHelp('qualified'), /person on the team confirmed/i)
})

test('the saved-view list offers candidate and qualified as separate views', () => {
  const keys = CREATOR_VIEWS.map(v => v.key)
  assert.ok(keys.includes('candidate'))
  assert.ok(keys.includes('qualified'))
  // The default must be the one that claims less.
  assert.equal(DEFAULT_CREATOR_VIEW, 'candidate')
})

test('the qualified view description does not overstate what it selects', () => {
  const desc = (key: string) => CREATOR_VIEWS.find(v => v.key === key)?.description ?? ''
  assert.match(desc('qualified'), /Confirmed by a person/i)
  assert.match(desc('candidate'), /Nobody has confirmed/i)
})

test('every organisation entity type is labelled and toned as needing attention', () => {
  for (const t of ORGANISATION_ENTITY_TYPES) {
    assert.notEqual(entityLabel(t), 'Not yet classified', `${t} has no label`)
    assert.equal(ENTITY_TONE[t], 'warning', `${t} should read as needing review`)
  }
  // An organisation is never the same thing as an individual creator.
  const orgs: readonly string[] = ORGANISATION_ENTITY_TYPES
  assert.ok(!orgs.includes('individual_creator'))
  assert.ok(!orgs.includes('unclassified'))
})

// ---------------------------------------------------------------------------
// Demo fixture: shape, safety and honesty
// ---------------------------------------------------------------------------

test('every demo client and product uses a .example domain and a fictional contact', () => {
  for (const c of CLIENTS) {
    assert.match(c.name, /^DEMO — /, `${c.name} is not marked as demo`)
    assert.match(c.website, /\.example(\/|$)/, `${c.name} website is not .example`)
    assert.match(c.contact_email, /@[\w.-]+\.example$/, `${c.name} email is not .example`)
    assert.match(c.primary_contact, /fictional/i)
  }
  for (const p of PRODUCTS) {
    assert.match(p.product_url, /\.example(\/|$)/)
  }
})

test('demo campaigns are marked and cover planning, active and completed', () => {
  const statuses = new Set(CAMPAIGNS.map(c => c.status))
  assert.ok(statuses.has('planning'))
  assert.ok(statuses.has('active'))
  assert.ok(statuses.has('completed'))
  for (const c of CAMPAIGNS) assert.match(c.name, /^DEMO — /)
})

test('the demo roster reaches every campaign stage', () => {
  const seen = new Set(ROSTER.flatMap(r => r.stages))
  for (const stage of CC_STAGES) {
    assert.ok(seen.has(stage), `no demo relationship sits at "${stage}"`)
  }
})

test('demo templates only use variables the renderer actually resolves', () => {
  const known = new Set<string>(VARIABLES.map(v => v.key))
  for (const t of TEMPLATES) {
    const followUps = (t.follow_ups ?? []) as { subject?: string; body: string }[]
    const text = [t.subject ?? '', t.body, ...followUps.flatMap(f => [f.subject ?? '', f.body])].join(' ')
    for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
      assert.ok(known.has(m[1]), `template "${t.name}" uses unknown variable {{${m[1]}}}`)
    }
  }
})

test('demo templates never claim a message was or will be sent', () => {
  for (const t of TEMPLATES) {
    assert.doesNotMatch(t.body, /\b(we sent|has been sent|sending now|auto-?send)\b/i)
  }
})

test('the demo scripts contain no transport of any kind', async () => {
  // The fixture is historical CRM notes. If a fetch, SMTP client, webhook or
  // Apify call ever appears in the seed path, this test fails.
  const { readFileSync } = await import('node:fs')
  for (const f of ['scripts/seed-demo.mjs', 'scripts/reset-demo.mjs', 'scripts/demo-fixture.mjs', 'scripts/demo-common.mjs']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8')
    for (const banned of [/\bfetch\s*\(/, /nodemailer/, /sendgrid/, /\baxios\b/, /apify/i, /https?:\/\/(?!.*\.(example|invalid))/]) {
      assert.doesNotMatch(src, banned, `${f} contains ${banned}`)
    }
  }
})

test('the demo reset order is child-before-parent', () => {
  const i = (t: string) => DEMO_TABLES_DELETE_ORDER.indexOf(t)
  // A child must be deleted before the row it points at.
  assert.ok(i('deliverables') < i('campaign_creators'))
  assert.ok(i('offers') < i('campaign_creators'))
  assert.ok(i('outreach_activities') < i('campaign_creators'))
  assert.ok(i('campaign_creators') < i('campaigns'))
  assert.ok(i('campaigns') < i('products'))
  assert.ok(i('products') < i('clients'))
  // The creator catalog is never in the deletion path.
  assert.ok(!DEMO_TABLES_DELETE_ORDER.includes('influencers'))
  assert.ok(PROTECTED_TABLES.includes('influencers'))
})
