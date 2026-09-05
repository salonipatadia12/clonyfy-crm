// One-off backfill: soft-hide fashion creators mis-tagged into the `design`
// niche. Non-destructive — sets influencers.hidden = true (reversible).
// Mirrors FASHION_PATTERNS in lib/apify.ts. Run: node scripts/hide-fashion-design.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FASHION = [
  /fashion design/, /fashion brand/, /fashion label/, /fashion house/, /fashion stylist/,
  /fashion blogger/, /fashion model/, /fashion week/, /fashion photographer/, /haute couture/,
  /\bcouture\b/, /streetwear/, /menswear/, /womenswear/, /swimwear/, /activewear/, /lingerie/,
  /\bootd\b/, /clothing brand/, /clothing line/, /apparel brand/, /\brunway\b/, /lookbook/,
  /\bfashionista\b/, /personal stylist/, /wardrobe stylist/, /\bmilliner/,
]
const isFashion = (bio, name) => {
  const t = `${bio || ''} ${name || ''}`.toLowerCase()
  return t.trim() ? FASHION.some(re => re.test(t)) : false
}

const { data: rows, error } = await db.from('influencers')
  .select('id, handle, full_name, biography, follower_count, hidden').eq('niche', 'design')
if (error) { console.error('❌', error.message); process.exit(1) }

const toHide = (rows ?? []).filter(r => !r.hidden && isFashion(r.biography, r.full_name))
console.log(`design rows: ${rows.length} · fashion matches to hide: ${toHide.length}`)
if (toHide.length) {
  console.log('examples:', toHide.slice(0, 12).map(r => `@${r.handle}`).join(', '))
  const ids = toHide.map(r => r.id)
  // update in chunks to keep the request small
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { error: ue } = await db.from('influencers').update({ hidden: true }).in('id', chunk)
    if (ue) { console.error('❌ update:', ue.message); process.exit(1) }
  }
  console.log(`✅ hid ${toHide.length} fashion creators from the design niche (reversible: set hidden=false)`)
} else {
  console.log('nothing to hide')
}
