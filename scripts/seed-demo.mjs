/**
 * Seeds simulated operational data into the current workspace.
 *
 *   npm run demo:seed                 seed (or re-sync) the demo run
 *   npm run demo:seed -- --dry        report what would change, write nothing
 *   npm run demo:seed -- --workspace <id>
 *
 * WHAT THIS DOES NOT DO
 *
 *   - It never creates an influencer. Demo campaigns reference REAL catalog
 *     records, because the point is to exercise the product against the real
 *     catalog.
 *   - It never writes to an influencer row. Not the handle, followers, email,
 *     phone, bio, geography, source evidence, entity_type or review_state.
 *     Creator selection reads those columns; it does not change them.
 *   - It never sends anything. `outreach_activities` rows are historical notes
 *     about messages that were never transmitted. There is no fetch, no SMTP,
 *     no webhook and no external API call anywhere in this file.
 *
 * IDEMPOTENCE
 *
 * Every row is addressed by (demo_run_id, demo_key) and written with an
 * `on conflict … do update`, so running the seed twice produces the same rows
 * with the same ids. The reconciliation table at the end reports inserted vs
 * reused so a second run is visibly a no-op.
 */
import { scoreMatch, briefFromCampaign } from '../lib/match.ts'
import {
  open, resolveWorkspace, findRun, countRun, hashInt, isoDate, isoTs, printTable,
} from './demo-common.mjs'
import {
  DEMO_LABEL, CLIENTS, PRODUCTS, CAMPAIGNS, ROSTER, SHARED_CREATOR_SLOTS, TEMPLATES,
} from './demo-fixture.mjs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const wsArg = argv.indexOf('--workspace')
const WANTED_WS = wsArg >= 0 ? argv[wsArg + 1] : null

const stats = { inserted: 0, reused: 0, updated: 0, skipped: 0, failed: 0 }
const perTable = new Map()
function note(table, kind) {
  stats[kind]++
  const t = perTable.get(table) ?? { table, inserted: 0, reused: 0, updated: 0, skipped: 0, failed: 0 }
  t[kind]++
  perTable.set(table, t)
}

// ---------------------------------------------------------------------------
// Creator selection — read-only, conservative, deterministic
// ---------------------------------------------------------------------------

/**
 * Tokens that disqualify a record from the demo roster.
 *
 * This is a FIXTURE-SELECTION filter, not a classifier. It decides which
 * existing creators the demo scenario is willing to reference; it never writes
 * a classification back to the catalog. When it is unsure it skips the record,
 * which costs nothing — there are thousands of candidates.
 */
const NOT_A_PERSON = /(\binc\b|\bllc\b|\bltd\b|\bcorp\b|\bco\b|\bgmbh\b|\bgroup\b|\bteam\b|\bagency\b|\bstudios?\b|\blabs?\b|\bmedia\b|\bofficial\b|\bhq\b|\bapp\b|\bsoftware\b|\bplatform\b|\bsolutions?\b|\bsystems?\b|\btechnolog|\bacademy\b|\bschool\b|\buniversit|\binstitut|\bmuseum\b|\bfoundation\b|\bmagazine\b|\bnews\b|\bdaily\b|\bfeed\b|\brepost\b|\bcommunity\b|\bmemes?\b|\btips?\b|\bhacks?\b|\bworld\b|\bzone\b|\bhub\b|\bcentral\b|\bnetwork\b|\bchannel\b|\bstore\b|\bshop\b|\bmarket\b|\bclub\b|\bcompany\b|\.com|\.io|\.ai\b|\.co\b|\bai\b|\bcrypto\b|\bblockchain\b|\bstartup\b|\bdesign(er|s)?\b|\bdeveloper\b|\bprogramming\b|\bcoding\b|\bmarketing\b|\binfluencer\b)/i

/**
 * Handles that read as an organisation even when the display name looks like a
 * person ("Farmacia SAAS", "pythoncommunity_"). Ambiguous records are skipped,
 * not resolved — the fixture has 1,400 candidates to choose from.
 */
const ORG_HANDLE = /(community|official|saas|agency|studio|labs?|media|academy|school|university|institute|magazine|news|daily|feed|repost|hq|team|group|company|store|shop|network|channel|world|zone|hub|central|club)/i

/** A leading personal-name segment: "Ada Okonkwo", "Ada Okonkwo | Dev". */
function personName(fullName) {
  if (!fullName) return null
  const head = String(fullName).split(/[|·•\-–—@(/]/)[0].trim()
  if (!head || head.length > 40) return null
  if (/\d/.test(head)) return null
  // Latin letters, spaces, apostrophes and hyphens only — decorative unicode
  // wordmarks ("ᴜɴɪᴠᴇʀsɪᴀ") are not names we can read, so they are skipped.
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]+$/.test(head)) return null
  const words = head.split(/\s+/).filter(w => w.length > 1)
  if (words.length < 2 || words.length > 4) return null
  if (NOT_A_PERSON.test(head)) return null
  // At least two words that start with a capital: "Ada Okonkwo", not "the best".
  if (words.filter(w => /^[A-ZÀ-Þ]/.test(w)).length < 2) return null
  return head
}

async function loadCandidatePool(c, workspaceId) {
  // Preference order is expressed in SQL so it is stable across runs:
  // human-approved individuals first, then unreviewed Instagram candidates.
  const { rows } = await c.query(`
    select id, handle, full_name, follower_count, niche, platform, geo_status,
           contact_status, email, phone, profile_url, entity_type,
           qualification_status, verification_status, review_state
      from influencers
     where workspace_id = $1
       and hidden = false
       and platform = 'instagram'
       and follower_count is not null
       and niche is not null
       and verification_status = 'instagram_verified'
       and review_state <> 'rejected'
       -- Never a positively identified organisation of any kind.
       and entity_type in ('individual_creator', 'unclassified')
       and qualification_status in ('qualified', 'candidate')
     order by (review_state = 'approved') desc, follower_count desc, handle asc`,
    [workspaceId])

  const pool = []
  let skipped = 0
  for (const r of rows) {
    const name = personName(r.full_name)
    if (!name || ORG_HANDLE.test(r.handle ?? '')) { skipped++; continue }
    pool.push({ ...r, follower_count: Number(r.follower_count), person_name: name })
  }
  return { pool, skipped, examined: rows.length }
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

async function upsert(c, table, key, cols, runId) {
  const names = Object.keys(cols)
  const vals = Object.values(cols)
  const ph = names.map((_, i) => `$${i + 1}`)
  const existing = await c.query(
    `select id from ${table} where demo_run_id = $1 and demo_key = $2`, [runId, key])
  if (existing.rows.length) {
    const set = names.map((n, i) => `${n} = $${i + 1}`).join(', ')
    const { rows } = await c.query(
      `update ${table} set ${set} where id = $${names.length + 1} returning id`,
      [...vals, existing.rows[0].id])
    note(table, 'reused')
    return rows[0].id
  }
  const { rows } = await c.query(
    `insert into ${table} (${names.join(', ')}) values (${ph.join(', ')}) returning id`, vals)
  note(table, 'inserted')
  return rows[0].id
}

// ---------------------------------------------------------------------------
// Per-stage recipes — what history a relationship at a given stage should have
// ---------------------------------------------------------------------------

/**
 * What history each status implies.
 *
 * "Not contacted" has none, which is the point — it is the pile of work.
 */
const STAGE_RECIPE = {
  not_contacted: { outreach: 0, offer: null,       deliverables: [] },
  contacted:     { outreach: 1, offer: null,       deliverables: [] },
  replied:       { outreach: 2, offer: 'sent',     deliverables: [] },
  interested:    { outreach: 3, offer: 'accepted', deliverables: ['published', 'planned'] },
  declined:      { outreach: 2, offer: 'declined', deliverables: [] },
}

const OFFER_TYPE_CYCLE = ['gifted', 'flat_fee', 'commission', 'flat_plus_commission', 'custom']
const OFFER_STATUS_CYCLE = ['draft', 'sent', 'counter_offered', 'accepted', 'declined']
const DELIVERABLE_KIND_CYCLE = ['reel', 'story', 'post', 'video', 'ugc_asset', 'other']

/** A 'post' is a carousel or a single static image; the schema stores one kind. */
const DELIVERABLE_TITLES = {
  reel: () => 'Reel',
  story: () => 'Story sequence',
  post: (i) => (i % 2 === 0 ? 'Carousel' : 'Static post'),
  video: () => 'UGC video',
  ugc_asset: () => 'UGC asset pack',
  other: () => 'Link-in-bio placement',
}

const REPLY_FLAVOURS = [
  { reply_status: 'replied_positive', notes: 'Interested — asked what the turnaround looks like.' },
  { reply_status: 'replied_positive', notes: 'Asked for rates before committing.' },
  { reply_status: 'replied_positive', notes: 'Wants more detail on the product before deciding.' },
  { reply_status: 'replied_negative', notes: 'Declined — already working with a competing brand this quarter.' },
  { reply_status: 'awaiting',         notes: 'No response yet.' },
  { reply_status: 'none',             notes: 'Draft written, not sent.' },
]

async function main() {
  const c = await open()
  const { workspace, actor } = await resolveWorkspace(c, WANTED_WS)
  console.log(`workspace : ${workspace.name} (${workspace.id})`)
  console.log(`actor     : ${actor.name}`)
  console.log(`mode      : ${DRY ? 'DRY RUN — nothing will be written' : 'write'}`)

  const { pool, skipped, examined } = await loadCandidatePool(c, workspace.id)
  console.log(`candidates: ${pool.length} person-shaped creators from ${examined} eligible catalog records (${skipped} skipped as ambiguous)`)
  if (pool.length < 40) throw new Error('Not enough person-shaped candidates to build the fixture safely.')

  if (DRY) {
    const { run } = await findRun(c, workspace.id)
    console.log(run ? `\nexisting run ${run.id} would be re-synced` : '\nno demo run yet; one would be created')
    printTable('Would create / re-sync:', [
      { entity: 'clients', count: CLIENTS.length },
      { entity: 'products', count: PRODUCTS.length },
      { entity: 'campaigns', count: CAMPAIGNS.length },
      { entity: 'campaign_creators', count: ROSTER.reduce((n, r) => n + r.stages.length, 0) },
      { entity: 'templates', count: TEMPLATES.length },
    ], ['entity', 'count'])
    await c.end()
    return
  }

  await c.query('begin')
  try {
    const { run, created } = await findRun(c, workspace.id, { create: true, actorId: actor.id })
    console.log(`demo run  : ${run.id} (${created ? 'created' : 'reused'})`)
    const R = run.id
    const base = { workspace_id: workspace.id, demo_run_id: R }

    // -- clients ------------------------------------------------------------
    const clientId = {}
    for (const cl of CLIENTS) {
      clientId[cl.key] = await upsert(c, 'clients', cl.key, {
        ...base, demo_key: cl.key, name: cl.name, website: cl.website,
        primary_contact: cl.primary_contact, contact_email: cl.contact_email,
        notes: cl.notes, status: cl.status, created_by: actor.id, updated_at: new Date(),
      }, R)
    }

    // -- products -----------------------------------------------------------
    const productId = {}
    for (const pr of PRODUCTS) {
      productId[pr.key] = await upsert(c, 'products', pr.key, {
        ...base, demo_key: pr.key, client_id: clientId[pr.client], name: pr.name,
        product_url: pr.product_url, category: pr.category, description: pr.description,
        target_customer: pr.target_customer, selling_points: pr.selling_points,
        price_note: pr.price_note, prohibited_claims: pr.prohibited_claims,
        talking_points: pr.talking_points, status: 'active',
        created_by: actor.id, updated_at: new Date(),
      }, R)
    }

    // -- campaigns ----------------------------------------------------------
    const campaignId = {}
    const campaignRow = {}
    for (const cp of CAMPAIGNS) {
      const cols = {
        ...base, demo_key: cp.key, name: cp.name,
        client: CLIENTS.find(x => x.key === cp.client).name,   // legacy free-text column
        client_id: clientId[cp.client], product_id: productId[cp.product],
        owner_id: actor.id, status: cp.status, objective: cp.objective,
        objective_note: cp.objective_note,
        start_date: isoDate(cp.startOffset), end_date: isoDate(cp.endOffset),
        brief: cp.brief_notes,
        brief_niches: cp.brief_niches, brief_min_followers: cp.brief_min_followers,
        brief_max_followers: cp.brief_max_followers, brief_geo: cp.brief_geo,
        brief_platforms: cp.brief_platforms, brief_entity_types: cp.brief_entity_types,
        brief_contact_pref: cp.brief_contact_pref, brief_creator_target: cp.brief_creator_target,
        brief_exclusions: cp.brief_exclusions ?? null, brief_notes: cp.brief_notes,
        offer_type: cp.offer_type, offer_flat_fee: cp.offer_flat_fee ?? null,
        offer_commission_pct: cp.offer_commission_pct ?? null,
        offer_gifted_product: cp.offer_gifted_product ?? null,
        offer_currency: cp.offer_currency, budget_total: cp.budget_total ?? null,
        deliverable_plan: JSON.stringify(cp.deliverable_plan), usage_rights: cp.usage_rights,
        whitelisting: cp.whitelisting, approval_required: cp.approval_required,
        talking_points: cp.talking_points ?? null, cta: cp.cta ?? null,
        discount_code: cp.discount_code ?? null, tracking_url: cp.tracking_url ?? null,
        hashtags: cp.hashtags ?? null, disclosure_required: cp.disclosure_required ?? null,
        updated_at: new Date(),
      }
      campaignId[cp.key] = await upsert(c, 'campaigns', cp.key, cols, R)
      campaignRow[cp.key] = cp
    }

    // -- roster assignment --------------------------------------------------
    // Each campaign draws from candidates whose niche its brief asks for, so
    // the match scores the UI shows are genuinely earned rather than decorative.
    const used = new Set()
    const assignment = {}   // campaignKey -> [creator, ...]
    for (const r of ROSTER) {
      const cp = campaignRow[r.campaign]
      const wanted = new Set(cp.brief_niches)
      const free = (list) => list.filter(p => !used.has(p.id))
      const picks = []
      let nicheCursor = 0
      let anyCursor = 0
      for (let i = 0; i < r.stages.length; i++) {
        // Every third slot takes a creator who has a real email or phone on
        // record, so the outreach queues are not 100% Instagram DM. Only 43 of
        // 2,865 candidates have an email, so without this they never surface.
        let next = null
        if (i % 3 === 0) {
          // Alternate email-first and phone-first so both queues fill.
          const wantPhone = ((i / 3) | 0) % 2 === 1
          const primary = free(pool.filter(p => (wantPhone ? p.phone : p.email)))
          const either = free(pool.filter(p => p.email || p.phone))
          next = primary.find(p => wanted.has(p.niche)) ?? primary[0]
              ?? either.find(p => wanted.has(p.niche)) ?? either[0] ?? null
        }
        if (!next) {
          const onNiche = free(pool.filter(p => wanted.has(p.niche)))
          const any = free(pool)
          next = onNiche[nicheCursor++] ?? any[anyCursor++] ?? null
        }
        if (!next) break
        picks.push(next); used.add(next.id)
      }
      assignment[r.campaign] = picks
    }

    // Force the shared creators, so the same person appears in two campaigns
    // with independent state. The displaced creator is dropped rather than
    // duplicated — a creator may appear at most once per campaign.
    for (const pair of SHARED_CREATOR_SLOTS) {
      const from = assignment[pair.a.campaign]?.[pair.a.slot]
      const target = assignment[pair.b.campaign]
      if (!from || !target || target.length <= pair.b.slot) continue
      if (target.some(t => t.id === from.id)) continue
      target[pair.b.slot] = from
    }

    // -- campaign_creators, outreach, offers, deliverables ------------------
    for (const r of ROSTER) {
      const cp = campaignRow[r.campaign]
      const brief = briefFromCampaign({
        brief_niches: cp.brief_niches, brief_min_followers: cp.brief_min_followers,
        brief_max_followers: cp.brief_max_followers, brief_geo: cp.brief_geo,
        brief_platforms: cp.brief_platforms, brief_contact_pref: cp.brief_contact_pref,
        brief_entity_types: cp.brief_entity_types,
      })
      const picks = assignment[r.campaign]

      for (let i = 0; i < picks.length; i++) {
        const cr = picks[i]
        const stage = r.stages[i]
        const ccKey = `${r.campaign}:${cr.handle}`
        const recipe = STAGE_RECIPE[stage]

        // The real scorer, over the creator's real stored fields.
        const match = scoreMatch({
          niche: cr.niche, follower_count: cr.follower_count, geo_status: cr.geo_status,
          platform: cr.platform, contact_status: cr.contact_status, email: cr.email,
          phone: cr.phone, profile_url: cr.profile_url, entity_type: cr.entity_type,
          qualification_status: cr.qualification_status,
          verification_status: cr.verification_status,
        }, brief)

        const age = 6 + hashInt(ccKey, 40)          // days since added
        // Anyone past "not contacted" was, by definition, contacted — including
        // someone who declined.
        const advanced = stage !== 'not_contacted'
        // Deliberately weighted towards "today" and "late", so the dashboard's
        // follow-up list has something in it the moment the seed finishes.
        // Only someone mid-conversation needs chasing, so "interested" and
        // "declined" carry no follow-up date at all.
        const nextFollowUp = stage === 'contacted' || stage === 'replied'
          // Indexed by slot rather than hashed, so the spread across
          // today / overdue / upcoming is even and predictable.
          ? isoDate([0, -4, 0, -11, 3][i % 5])
          : null

        const ccId = await upsert(c, 'campaign_creators', ccKey, {
          ...base, demo_key: ccKey, campaign_id: campaignId[r.campaign],
          influencer_id: cr.id, handle: cr.handle, stage,
          owner_id: actor.id, match_score: match.score,
          match_reasons: JSON.stringify(match.reasons),
          next_follow_up: nextFollowUp,
          last_touch: advanced ? isoTs(-hashInt(ccKey + 'lt', 12) - 1) : null,
          // The two plain fields the campaign row shows. A creator with no
          // email is never given one — the channel follows what is on record.
          outreach_channel: advanced ? (cr.email ? 'email' : cr.phone && hashInt(ccKey, 3) === 0 ? 'phone' : 'instagram_dm') : null,
          last_contacted_on: advanced ? isoDate(-hashInt(ccKey + 'lt', 12) - 1) : null,
          notes: NOTE_FOR_STAGE(stage, cr.person_name),
          source: 'suggested', added_by: actor.id,
          added_at: isoTs(-age), updated_at: new Date(),
        }, R)

        // -- outreach ------------------------------------------------------
        for (let k = 0; k < recipe.outreach; k++) {
          const oaKey = `${ccKey}:oa${k}`
          // Channel follows what the creator actually has. A creator with no
          // email is never given one — the message goes by Instagram DM, or is
          // recorded as an internal phone note.
          const channel = k === 0
            ? (cr.email ? 'email' : 'instagram_dm')
            : (k === 2 && cr.phone ? 'phone' : 'instagram_dm')
          const inbound = k === 1
          const flavour = REPLY_FLAVOURS[hashInt(oaKey, REPLY_FLAVOURS.length)]
          await upsert(c, 'outreach_activities', oaKey, {
            ...base, demo_key: oaKey, campaign_creator_id: ccId,
            channel, direction: inbound ? 'inbound' : 'outbound',
            subject: channel === 'email' && !inbound ? `Partnership on ${cp.name}` : null,
            body: inbound
              ? `[Simulated] ${flavour.notes}`
              : `[Simulated — never sent] Hi ${cr.person_name.split(' ')[0]}, we're lining up creators for ${cp.name}.`,
            occurred_at: isoTs(-(age - k * 3)),
            reply_status: inbound ? flavour.reply_status
              : (recipe.outreach > 1 ? 'awaiting' : 'none'),
            next_follow_up: nextFollowUp,
            notes: channel === 'phone'
              ? 'Internal note only. No call was placed.'
              : 'Simulated demo record. This message was never transmitted.',
            logged_by: actor.id,
          }, R)
        }

        // -- offer ---------------------------------------------------------
        if (recipe.offer) {
          const offKey = `${ccKey}:offer`
          const type = OFFER_TYPE_CYCLE[hashInt(offKey, OFFER_TYPE_CYCLE.length)]
          // The stage decides the status, so the board and the offer can never
          // disagree — a creator at "negotiating" has a counter-offer on file.
          const status = recipe.offer
          const fee = 250 + hashInt(offKey, 12) * 100
          await upsert(c, 'offers', offKey, {
            ...base, demo_key: offKey, campaign_creator_id: ccId,
            offer_type: type,
            flat_fee: ['flat_fee', 'flat_plus_commission', 'custom'].includes(type) ? fee : null,
            commission_pct: ['commission', 'flat_plus_commission'].includes(type)
              ? 8 + hashInt(offKey + 'c', 8) : null,
            gifted_product: ['gifted', 'custom'].includes(type)
              ? (cp.offer_gifted_product ?? 'Product sample') : null,
            currency: 'USD', status,
            agreed_at: status === 'accepted' ? isoDate(-(age - 4)) : null,
            usage_rights: cp.usage_rights, exclusivity: 'None (fictional terms).',
            whitelisting: cp.whitelisting,
            notes: 'Simulated demo offer. No agreement exists and no money is owed.',
            created_by: actor.id, updated_at: new Date(),
          }, R)
        }

        // -- deliverables ---------------------------------------------------
        for (let d = 0; d < recipe.deliverables.length; d++) {
          const dKey = `${ccKey}:dlv${d}`
          const kind = DELIVERABLE_KIND_CYCLE[hashInt(dKey, DELIVERABLE_KIND_CYCLE.length)]
          const state = recipe.deliverables[d]
          // Spread due dates over overdue / today / soon so the Deliverables
          // queues are all reachable.
          const dueBucket = hashInt(dKey + 'due', 4)
          const due = state === 'published' ? isoDate(-(age - 2)) : isoDate([-4, 0, 3, 9][dueBucket])
          const published = state === 'published'
          const submitted = state !== 'planned'
          await upsert(c, 'deliverables', dKey, {
            ...base, demo_key: dKey, campaign_creator_id: ccId,
            platform: 'instagram', kind,
            title: `${DELIVERABLE_TITLES[kind](d)} — ${cp.name.replace('DEMO — ', '')}`,
            brief: 'Simulated demo deliverable. Nothing was produced or published.',
            due_date: due,
            submitted_url: submitted ? 'https://example.invalid/demo-submission' : null,
            submitted_at: submitted ? isoTs(-(age - 6)) : null,
            approval_state: state,
            feedback: state === 'changes_requested'
              ? 'Please move the disclosure to the first line of the caption.' : null,
            approved_at: ['approved', 'published'].includes(state) ? isoTs(-(age - 8)) : null,
            published_url: published ? 'https://example.invalid/demo-post' : null,
            published_at: published ? isoDate(-(age - 9)) : null,
            // Simulated performance, present only on published rows. Everything
            // else stays NULL, which the UI renders as "Not recorded".
            views: published ? 12000 + hashInt(dKey + 'v', 90) * 500 : null,
            likes: published ? 400 + hashInt(dKey + 'l', 60) * 20 : null,
            comments_count: published ? 8 + hashInt(dKey + 'c', 40) : null,
            saves: published ? 20 + hashInt(dKey + 's', 60) : null,
            clicks: published ? 60 + hashInt(dKey + 'k', 80) * 3 : null,
            conversions: published ? hashInt(dKey + 'x', 25) : null,
            created_by: actor.id, updated_at: new Date(),
          }, R)
        }
      }
    }

    // -- templates ----------------------------------------------------------
    for (const t of TEMPLATES) {
      await upsert(c, 'templates', t.key, {
        ...base, demo_key: t.key, name: t.name, channel: t.channel,
        campaign_id: t.campaign ? campaignId[t.campaign] : null,
        product_id: t.product ? productId[t.product] : null,
        subject: t.subject ?? null, body: t.body,
        follow_ups: JSON.stringify(t.follow_ups ?? []),
        created_by: actor.id, updated_by: actor.id,
      }, R)
    }

    await c.query('commit')

    // -- reconciliation -----------------------------------------------------
    const counts = await countRun(c, R)
    printTable('Reconciliation', [...perTable.values()].map(t => ({
      ...t, 'rows now': counts[t.table] ?? 0,
    })), ['table', 'inserted', 'reused', 'updated', 'skipped', 'failed', 'rows now'])
    console.log(`\ntotals: ${stats.inserted} inserted · ${stats.reused} reused · ${stats.updated} updated · ${stats.skipped} skipped · ${stats.failed} failed`)

    const { rows: check } = await c.query(
      `select count(*)::int n from influencers where workspace_id = $1`, [workspace.id])
    console.log(`influencers: ${check.rows ?? check[0].n} — unchanged (the seed never writes to this table)`)
    console.log(`\nRemove with: npm run demo:reset -- --confirm`)
  } catch (e) {
    await c.query('rollback')
    console.error('\nFAILED, rolled back: ' + e.message)
    console.error(e.stack)
    await c.end()
    process.exit(1)
  }
  await c.end()
}

function NOTE_FOR_STAGE(stage, name) {
  const first = name.split(' ')[0]
  switch (stage) {
    case 'not_contacted': return `${first} looks like a fit on niche and audience size. Nobody has reached out yet.`
    case 'contacted': return 'First message logged. No reply yet.'
    case 'replied': return `${first} replied and asked for more detail before deciding.`
    case 'interested': return 'Wants to go ahead (simulated).'
    case 'declined': return 'Not proceeding — already working with a competing brand this quarter.'
    default: return null
  }
}

main().catch(e => { console.error(e); process.exit(1) })
