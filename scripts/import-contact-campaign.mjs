// Imports a US_CONTACT_FIRST_CREATOR_HARVEST campaign into the catalog.
//
//   node scripts/import-contact-campaign.mjs <campaign-dir> --dry
//   node scripts/import-contact-campaign.mjs <campaign-dir>
//
// Two populations arrive with genuinely different provenance and they must not
// be flattened together:
//
//  * Phase 0 (`existing_*.csv`) — profiles already purchased on Apify. These
//    carry real scraped Instagram data (followers, bio, verified flag) and the
//    contacts were recovered afterwards by crawling the creator's own site.
//    They import as verification_status = 'instagram_verified'.
//
//  * Tier A (`complete_contact_influencers.csv`) — found contact-first and
//    NEVER scraped on Instagram. No follower count, no bio, and the niche is
//    inferred from the person's website rather than confirmed on the profile.
//    They import as 'pending_instagram_verification' so the UI can keep them
//    out of the verified catalog. Writing a blank follower_count next to
//    verified rows without that flag is what would make the catalog lie.
//
// Contact provenance (source URL, label, confidence) is carried for both, so
// any address or number in the CRM can be traced back to the page it came from.
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const dir = args.find(a => !a.startsWith('--'))
const DRY = args.includes('--dry')
if (!dir || !fs.existsSync(path.join(dir, 'out'))) {
  console.error('usage: node scripts/import-contact-campaign.mjs <campaign-dir> [--dry]')
  process.exit(1)
}
const OUT = path.join(dir, 'out')
const campaign = path.basename(dir)

// The campaign writes niche slugs already; map its two divergent names onto the
// catalog's vocabulary and reject anything outside the approved set.
const NICHE_MAP = {
  design: 'design',
  technology: 'technology',
  web_development: 'web_dev',
  software_development: 'software_dev',
  digital_marketing: 'digital_marketing',
  business_entrepreneurship: 'business_entrepreneurship',
  online_business: 'online_business',
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const { data: ws } = await db.from('users').select('workspace_id').eq('role', 'admin').limit(1).single()
if (!ws) { console.error('no admin workspace'); process.exit(1) }
const workspaceId = ws.workspace_id

const read = f => {
  const p = path.join(OUT, f)
  if (!fs.existsSync(p)) return []
  return Papa.parse(fs.readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true }).data
}

const num = v => { const n = Number(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null }
const int = v => { const n = parseInt(String(v ?? '').replace(/[, ]/g, ''), 10); return Number.isFinite(n) ? n : null }
const txt = v => { const s = String(v ?? '').trim(); return s && s !== 'None' && s !== 'nan' ? s : null }
const bucketFor = f => f == null ? null : f < 1000 ? '<1K' : f < 10000 ? '1K-10K' : f < 50000 ? '10K-50K' : f < 100000 ? '50K-100K' : f < 500000 ? '100K-500K' : '500K+'
const bool = v => String(v ?? '').toLowerCase() === 'true'

// The campaign can attribute several niches to one creator; the catalog stores
// one. Take the first approved slug rather than inventing a combined value.
function firstNiche(raw) {
  for (const part of String(raw ?? '').split(';').map(s => s.trim()).filter(Boolean)) {
    if (NICHE_MAP[part]) return NICHE_MAP[part]
  }
  return null
}

const PHONE_TYPES = new Set(['mobile', 'landline', 'business', 'voip', 'toll_free', 'unknown'])
const EMAIL_TYPES = new Set(['named_professional', 'generic_business', 'booking_partnership'])

const rows = []
const skip = { no_handle: 0, dupe: 0, no_contact: 0 }
const seen = new Set()

function push(r) {
  if (!r.handle) { skip.no_handle++; return }
  if (seen.has(r.handle)) { skip.dupe++; return }
  if (!r.email && !r.phone) { skip.no_contact++; return }
  seen.add(r.handle)
  rows.push(r)
}

// ---- Phase 0: profiles we already own, contacts recovered from their sites ---
for (const [file, bucket] of [
  ['existing_complete_contacts.csv', 'complete'],
  ['existing_email_only.csv', 'email_only'],
  ['existing_phone_only.csv', 'phone_only'],
]) {
  for (const r of read(file)) {
    const handle = String(r.instagram_handle || '').trim().toLowerCase().replace(/^@/, '')
    const followers = int(r.follower_count)
    const ptype = txt(r.phone_type)
    const etype = txt(r.email_type)
    push({
      workspace_id: workspaceId,
      platform: 'instagram',
      handle,
      full_name: txt(r.full_name) || handle,
      follower_count: followers,
      follower_bucket: bucketFor(followers),
      niche: firstNiche(r.niche),
      country: 'US',                       // Phase 0 profiles were US-confirmed upstream
      biography: txt(r.biography),
      bio_link: txt(r.bio_link),
      profile_url: txt(r.instagram_url) || `https://www.instagram.com/${handle}/`,
      is_verified: false,
      email: txt(r.public_email),
      email_type: EMAIL_TYPES.has(etype) ? etype : null,
      email_source_url: txt(r.email_source_url),
      email_confidence: num(r.email_confidence),
      phone: txt(r.phone_e164),
      phone_original: txt(r.phone_original),
      phone_type: PHONE_TYPES.has(ptype) ? ptype : null,
      phone_source_url: txt(r.phone_source_url),
      phone_source_label: txt(r.phone_source_label),
      phone_confidence: num(r.phone_confidence),
      discovery_route: 'phase0_contact_recovery',
      source_anchor: txt(r.email_source_url) || txt(r.phone_source_url),
      identity_confidence: bool(r.site_instagram_backlink) ? 0.9 : null,
      source: `${campaign}:phase0_${bucket}`,
      location: 'CONFIRMED_US',
      verification_status: 'instagram_verified',   // real scraped profile data
      scraped_at: new Date().toISOString(),
    })
  }
}

// ---- Tier A: found contact-first, never scraped on Instagram ---------------
for (const r of read('complete_contact_influencers.csv')) {
  const handle = String(r.instagram_handle || '').trim().toLowerCase().replace(/^@/, '')
  const ptype = txt(r.phone_type)
  const etype = txt(r.email_type)
  push({
    workspace_id: workspaceId,
    platform: 'instagram',
    handle,
    full_name: txt(r.full_name) || handle,
    // deliberately null: no Instagram scrape has happened, so there is no
    // follower count and none may be implied
    follower_count: null,
    follower_bucket: null,
    niche: firstNiche(r.niche),
    country: txt(r.creator_country) === 'US' ? 'US' : null,
    biography: null,
    bio_link: txt(r.bio_link),
    profile_url: txt(r.instagram_url) || `https://www.instagram.com/${handle}/`,
    is_verified: false,
    email: txt(r.public_email),
    email_type: EMAIL_TYPES.has(etype) ? etype : null,
    email_source_url: txt(r.email_source_url),
    email_confidence: num(r.email_confidence),
    phone: txt(r.phone_e164),
    phone_original: txt(r.phone_original),
    phone_type: PHONE_TYPES.has(ptype) ? ptype : null,
    phone_source_url: txt(r.phone_source_url),
    phone_source_label: txt(r.phone_source_label),
    phone_confidence: num(r.phone_confidence),
    discovery_route: txt(r.discovery_route),
    source_anchor: txt(r.source_anchor),
    identity_confidence: num(r.identity_confidence),
    source: `${campaign}:${txt(r.discovery_route) || 'tier_a'}`,
    location: txt(r.geo_status) || 'CONFIRMED_US',
    verification_status: 'pending_instagram_verification',
    scraped_at: null,
  })
}

const byStatus = rows.reduce((a, r) => { a[r.verification_status] = (a[r.verification_status] || 0) + 1; return a }, {})
const byContact = rows.reduce((a, r) => {
  const k = r.email && r.phone ? 'complete' : r.email ? 'email_only' : 'phone_only'
  a[k] = (a[k] || 0) + 1; return a
}, {})

console.log(`campaign : ${campaign}`)
console.log(`to import: ${rows.length}${DRY ? '  · DRY-RUN' : ''}`)
console.log(`  skipped : ${Object.entries(skip).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ') || 'none'}`)
console.log(`  status  : ${JSON.stringify(byStatus)}`)
console.log(`  contact : ${JSON.stringify(byContact)}`)
console.log(`  niches  : ${JSON.stringify(rows.reduce((a, r) => { a[r.niche ?? 'null'] = (a[r.niche ?? 'null'] || 0) + 1; return a }, {}))}`)
console.log(`  with phone: ${rows.filter(r => r.phone).length} · with email: ${rows.filter(r => r.email).length}`)

if (DRY) { console.log('\n(dry run — nothing written)'); process.exit(0) }

let written = 0
for (let i = 0; i < rows.length; i += 200) {
  const { data, error } = await db.from('influencers')
    .upsert(rows.slice(i, i + 200), { onConflict: 'workspace_id,platform,handle' })
    .select('handle')
  if (error) { console.log(`  batch ${i} error: ${error.message}`); continue }
  written += data?.length ?? 0
}
console.log(`\nupserted ${written} creators`)
