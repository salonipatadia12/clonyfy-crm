// Smoke-test the live data-layer queries (service role). Verifies the PostgREST
// filter strings, pipeline insert constraints, and activity-log enum, then cleans up.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2]
  }
  return out
}

async function main() {
  const env = readEnv()
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: admin } = await db.from('users').select('id, workspace_id, name').eq('role', 'admin').limit(1).single()
  const ws = admin!.workspace_id
  console.log('workspace:', ws, 'admin:', admin!.name)

  // 1. search filter (.or ilike) + count
  const s = '%dev%'
  const { data: searchRows, count, error: e1 } = await db.from('influencers')
    .select('handle, full_name', { count: 'exact' })
    .eq('workspace_id', ws).or(`handle.ilike.${s},full_name.ilike.${s},biography.ilike.${s}`)
    .order('follower_count', { ascending: false, nullsFirst: false }).range(0, 4)
  if (e1) throw new Error('search filter: ' + e1.message)
  console.log(`[1] search "dev" → ${count} matches; top:`, searchRows?.map(r => r.handle).join(', '))

  // 2. .not in filter
  const exclude = (searchRows ?? []).map(r => r.handle)
  const { error: e2 } = await db.from('influencers').select('handle')
    .eq('workspace_id', ws).not('handle', 'in', `(${exclude.map(h => `"${h}"`).join(',')})`).limit(1)
  if (e2) throw new Error('not-in filter: ' + e2.message)
  console.log('[2] not-in filter OK')

  // 3. pipeline insert (unique + stage check) + denormalized fields
  const target = searchRows![0]
  const { data: cat } = await db.from('influencers').select('full_name, follower_count, niche').eq('workspace_id', ws).eq('handle', target.handle).single()
  const { data: pipe, error: e3 } = await db.from('pipeline').upsert({
    workspace_id: ws, handle: target.handle, full_name: cat!.full_name, follower_count: cat!.follower_count,
    niche: cat!.niche, stage: 'prospecting', assigned_to: admin!.id, assigned_name: admin!.name, assigned_by: admin!.id,
    assigned_at: new Date().toISOString(), last_touch: new Date().toISOString(), added_via: 'smoke',
  }, { onConflict: 'workspace_id,handle,assigned_to' }).select().single()
  if (e3) throw new Error('pipeline insert: ' + e3.message)
  console.log('[3] pipeline insert OK:', pipe.handle, '→', pipe.stage)

  // 4. activity_log enum insert
  const { error: e4 } = await db.from('activity_log').insert({
    workspace_id: ws, user_id: admin!.id, user_name: admin!.name, profile_handle: target.handle,
    profile_name: cat!.full_name, action: 'added_to_pipeline', metadata: { via: 'smoke' },
  })
  if (e4) throw new Error('activity insert: ' + e4.message)
  console.log('[4] activity_log insert OK')

  // 5. stage update (check constraint) + invalid-stage rejection
  const { error: e5 } = await db.from('pipeline').update({ stage: 'contacted' }).eq('id', pipe.id)
  if (e5) throw new Error('stage update: ' + e5.message)
  const { error: e5b } = await db.from('pipeline').update({ stage: 'bogus' }).eq('id', pipe.id)
  console.log('[5] stage update OK; invalid stage rejected:', !!e5b)

  // cleanup
  await db.from('pipeline').delete().eq('id', pipe.id)
  await db.from('activity_log').delete().eq('workspace_id', ws).eq('action', 'added_to_pipeline').contains('metadata', { via: 'smoke' })
  console.log('[cleanup] removed smoke rows')
  console.log('\nALL SMOKE CHECKS PASSED')
}

main().catch(e => { console.error('SMOKE FAILED:', e.message ?? e); process.exit(1) })
