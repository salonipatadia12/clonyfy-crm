/**
 * Template variable resolution.
 *
 * Every variable maps to a stored field on the campaign, its product, its client
 * or the creator. A variable with no value is reported as missing and rendered
 * as an empty string — it is never guessed and never left as a raw `{{token}}`
 * in text the user is about to send.
 */
import type { Campaign, CampaignCreator } from '@/types/campaign'

export interface TemplateContext {
  campaign: Pick<Campaign,
    'name' | 'client_name' | 'product_name' | 'cta' | 'discount_code' | 'tracking_url'
    | 'offer_type' | 'offer_flat_fee' | 'offer_gifted_product' | 'offer_currency' | 'talking_points'>
  creator: Pick<CampaignCreator, 'handle' | 'full_name' | 'follower_count' | 'niche'>
  senderName?: string
}

export const VARIABLES = [
  { key: 'first_name', description: "The creator's first name, or their handle when no name is recorded." },
  { key: 'full_name', description: "The creator's full name." },
  { key: 'handle', description: 'Their handle, without the @.' },
  { key: 'niche', description: 'Their recorded niche.' },
  { key: 'followers', description: 'Their follower count, formatted (e.g. 12.4K).' },
  { key: 'client', description: 'The client this campaign is for.' },
  { key: 'product', description: 'The product being promoted.' },
  { key: 'campaign', description: 'The campaign name.' },
  { key: 'offer', description: "A sentence describing the campaign's default offer." },
  { key: 'cta', description: "The campaign's call to action." },
  { key: 'discount_code', description: "The campaign's discount code." },
  { key: 'tracking_url', description: "The campaign's tracking link." },
  { key: 'talking_point', description: 'The first approved talking point on the campaign.' },
  { key: 'sender_name', description: 'Your name.' },
] as const

export type VariableKey = (typeof VARIABLES)[number]['key']

function formatFollowers(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function offerSentence(c: TemplateContext['campaign']): string {
  switch (c.offer_type) {
    case 'gifted': return c.offer_gifted_product ? `a free ${c.offer_gifted_product}` : ''
    case 'flat_fee': return c.offer_flat_fee != null ? `a flat fee of ${c.offer_flat_fee} ${c.offer_currency ?? 'USD'}` : ''
    case 'commission': return 'a commission on every sale you drive'
    case 'flat_plus_commission':
      return c.offer_flat_fee != null
        ? `${c.offer_flat_fee} ${c.offer_currency ?? 'USD'} up front plus commission`
        : 'a flat fee plus commission'
    default: return ''
  }
}

export function resolveVariables(ctx: TemplateContext): Record<VariableKey, string> {
  const { campaign: c, creator: cr } = ctx
  const first = (cr.full_name ?? '').trim().split(/\s+/)[0]
  return {
    first_name: first || cr.handle,
    full_name: cr.full_name ?? '',
    handle: cr.handle,
    niche: (cr.niche ?? '').replace(/_/g, ' '),
    followers: formatFollowers(cr.follower_count),
    client: c.client_name ?? '',
    product: c.product_name ?? '',
    campaign: c.name ?? '',
    offer: offerSentence(c),
    cta: c.cta ?? '',
    discount_code: c.discount_code ?? '',
    tracking_url: c.tracking_url ?? '',
    talking_point: c.talking_points?.[0] ?? '',
    sender_name: ctx.senderName ?? '',
  }
}

/**
 * Replaces `{{token}}` occurrences and reports which ones had nothing to fill
 * them with, so the composer can warn before the user copies the text.
 */
export function renderTemplate(text: string, ctx: TemplateContext): { text: string; missing: string[] } {
  const values = resolveVariables(ctx)
  const missing = new Set<string>()
  const out = (text ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, raw: string) => {
    const key = raw.toLowerCase() as VariableKey
    if (!(key in values)) { missing.add(raw); return '' }
    const v = values[key]
    if (!v) { missing.add(key); return '' }
    return v
  })
  return { text: out, missing: [...missing] }
}
