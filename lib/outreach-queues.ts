/**
 * Outreach queue definitions, shared by the server (which computes membership)
 * and the client (which renders the tabs).
 *
 * These replace the old single "Outreach Ready" gate that required Instagram
 * AND email AND phone — a definition that matched 51 of 4,596 catalog records
 * and hid every creator who could be DM'd.
 */
import type { OutreachQueue } from '@/types/campaign'

export const OUTREACH_QUEUE_META: { key: OutreachQueue; label: string; description: string }[] = [
  { key: 'follow_up_due',     label: 'Follow-up due',      description: 'A follow-up date has arrived or already passed. Most urgent first.' },
  { key: 'replied',           label: 'Replied',            description: 'The creator answered. Pick the conversation back up before it goes cold.' },
  { key: 'awaiting_response', label: 'Awaiting response',  description: 'Contacted at least once with no reply recorded yet.' },
  { key: 'instagram_ready',   label: 'Instagram DM ready', description: 'Has a verified Instagram profile you can DM, regardless of whether an email exists.' },
  { key: 'email_ready',       label: 'Email ready',        description: 'A public email address is on file.' },
  { key: 'phone_available',   label: 'Phone available',    description: 'A public phone number is on file. This is a bonus, never a requirement.' },
  { key: 'missing_contact',   label: 'Missing contact',    description: 'No Instagram profile, email or phone. Needs enrichment before any outreach is possible.' },
]

/**
 * Which queues a campaign creator belongs to.
 *
 * Readiness is per channel and additive: a creator with only an Instagram
 * profile is Instagram-DM-ready. `missing_contact` is the only exclusive state
 * and applies solely when no channel at all exists.
 *
 * Pure and dependency-free so it can be unit-tested and shared by the server
 * (which computes the queues) and the client (which renders them).
 */
export function queuesFor(row: {
  stage: string
  next_follow_up: string | null
  last_reply_status: string | null
  outreach_count: number
  email: string | null
  phone: string | null
  profile_url: string | null
  platform?: string | null
  verification_status: string | null
}, today = new Date().toISOString().slice(0, 10)): OutreachQueue[] {
  const out: OutreachQueue[] = []
  const closed = row.stage === 'completed' || row.stage === 'rejected'

  if (!closed && row.next_follow_up && row.next_follow_up <= today) out.push('follow_up_due')
  const replied = row.last_reply_status === 'replied_positive'
    || row.last_reply_status === 'replied_negative'
    || row.stage === 'replied'
  if (replied) out.push('replied')
  if (!closed && row.outreach_count > 0 && !replied) out.push('awaiting_response')

  const hasInstagram = !!row.profile_url && /(^|\/\/|\.)instagram\.com\//i.test(row.profile_url)
    && row.verification_status !== 'pending_instagram_verification'
  const hasEmail = !!row.email?.trim()
  const hasPhone = !!row.phone?.trim()
  if (hasInstagram) out.push('instagram_ready')
  if (hasEmail) out.push('email_ready')
  if (hasPhone) out.push('phone_available')
  if (!hasInstagram && !hasEmail && !hasPhone) out.push('missing_contact')
  return out
}
