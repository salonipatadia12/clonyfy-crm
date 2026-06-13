import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function handleFromUrl(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // Accept a bare handle or a full instagram URL.
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  const raw = m ? m[1] : s.replace(/^@/, '')
  const handle = raw.replace(/^@/, '').split(/[/?#]/)[0]
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle.toLowerCase() : null
}

// Best-effort public profile preview. Instagram frequently blocks server-side
// requests, so this gracefully degrades to just the handle when it can't read.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || req.nextUrl.searchParams.get('handle') || ''
  const handle = handleFromUrl(url)
  if (!handle) return NextResponse.json({ error: 'Enter a valid Instagram handle or URL' }, { status: 400 })

  const profile_url = `https://www.instagram.com/${handle}/`
  const result: { handle: string; name: string; profile_url: string; follower_count: number | null; biography: string | null; fetched: boolean } = {
    handle, name: handle, profile_url, follower_count: null, biography: null, fetched: false,
  }

  try {
    const res = await fetch(profile_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const html = await res.text()
      const desc = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1]
      const title = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]
      if (title) result.name = title.replace(/\s*\(@[^)]*\)\s*.*/i, '').replace(/ on Instagram.*/i, '').trim() || handle
      if (desc) {
        const fm = desc.match(/([\d.,]+[KMB]?)\s+Followers/i)
        if (fm) result.follower_count = parseCount(fm[1])
        const bioPart = desc.split(' - ').slice(1).join(' - ')
        if (bioPart) result.biography = bioPart.replace(/See Instagram photos.*/i, '').trim() || null
        result.fetched = true
      }
    }
  } catch { /* blocked or timed out — fall back to handle only */ }

  return NextResponse.json(result)
}

function parseCount(s: string): number | null {
  const m = s.replace(/,/g, '').match(/^([\d.]+)([KMB]?)$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  const mult = m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1
  return Math.round(n * mult)
}
