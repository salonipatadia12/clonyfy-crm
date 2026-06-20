import Papa from 'papaparse'
import path from 'node:path'
import fs from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'

// Seeds the influencers table for a workspace from the scraper CSV. Must be
// called with a service-role client (bypasses RLS). Idempotent per workspace
// via upsert on (workspace_id, handle).

const MIN_FOLLOWERS = 1000

type Row = Record<string, string>

const toInt = (v?: string): number | null => {
  if (v == null || v === '') return null
  const n = parseInt(String(v).replace(/[, ]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}
const toFloat = (v?: string): number | null => {
  if (v == null || v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
const yes = (v?: string) => String(v).toLowerCase() === 'yes' || v === '1'

function bucket(followers: number | null): string | null {
  if (followers == null) return null
  if (followers < 1000) return '<1K'
  if (followers < 10000) return '1K-10K'
  if (followers < 50000) return '10K-50K'
  if (followers < 100000) return '50K-100K'
  if (followers < 500000) return '100K-500K'
  return '500K+'
}

export function locateSeedCsv(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'output', 'instagram_outreach.csv'),
    path.join(process.cwd(), 'seed-data', 'instagram_outreach.csv'),
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

export async function seedInfluencers(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ inserted: number; skipped: number }> {
  const csvPath = locateSeedCsv()
  if (!csvPath) throw new Error('seed CSV not found (looked in ../output and ./seed-data)')

  const parsed = Papa.parse<Row>(fs.readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true })
  const rows = parsed.data.filter(r =>
    r.handle && !yes(r.is_brand_noise) && (toInt(r.follower_count) ?? 0) >= MIN_FOLLOWERS,
  )

  const now = new Date().toISOString()
  const records = rows.map(r => {
    const handle = r.handle.trim().toLowerCase().replace(/^@/, '')
    const followers = toInt(r.follower_count)
    return {
      workspace_id: workspaceId,
      handle,
      full_name: (r.full_name && r.full_name.trim()) || handle,
      follower_count: followers,
      niche: r.niche || null,
      country: r.country_seed || null,
      biography: r.biography || null,
      bio_link: r.bio_link || null,
      profile_url: r.profile_url || `https://www.instagram.com/${handle}/`,
      is_verified: yes(r.is_verified),
      email: r.business_email || null,
      scraped_at: r.scraped_at || now,
      // carried but hidden from UI:
      engagement_rate: toFloat(r.engagement_rate),
      eng_quality: r.eng_quality || null,
      account_type: r.account_type || null,
      quality_tier: r.quality_tier || null,
      market: r.market || null,
      follower_bucket: bucket(followers),
    }
  })

  // De-dupe handles within the batch (CSV can repeat); keep first.
  const seen = new Set<string>()
  const unique = records.filter(r => (seen.has(r.handle) ? false : (seen.add(r.handle), true)))

  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('influencers')
      .upsert(chunk, { onConflict: 'workspace_id,handle', count: 'exact', ignoreDuplicates: false })
    if (error) throw new Error(`seed chunk ${i}-${i + chunk.length} failed: ${error.message}`)
    inserted += count ?? chunk.length
  }

  return { inserted, skipped: records.length - unique.length }
}
