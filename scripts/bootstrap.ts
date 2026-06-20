// One-time bootstrap / verification: create an admin account + workspace and
// seed the influencer catalog. Idempotent. Run: npx tsx scripts/bootstrap.ts <email> <password> [workspaceName] [adminName]
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { seedInfluencers } from '../lib/seed'

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  const p = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

async function main() {
  const [email, password, workspaceName = 'Clonyfy', adminName = 'Admin'] = process.argv.slice(2)
  if (!email || !password) { console.error('usage: tsx scripts/bootstrap.ts <email> <password> [workspace] [name]'); process.exit(1) }

  const env = readEnv()
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Auth user (idempotent).
  let userId: string | undefined
  const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created?.user) userId = created.user.id
  else if (cErr && /already|registered|exists/i.test(cErr.message)) {
    // Find existing user by listing (small project).
    const { data: list } = await db.auth.admin.listUsers()
    userId = list?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())?.id
  } else if (cErr) throw cErr
  if (!userId) throw new Error('could not resolve user id')
  console.log('user:', userId)

  // 2. Workspace + admin profile (idempotent).
  let workspaceId: string
  const { data: prof } = await db.from('users').select('workspace_id').eq('id', userId).maybeSingle()
  if (prof) {
    workspaceId = prof.workspace_id
    console.log('existing workspace:', workspaceId)
  } else {
    const { data: ws, error: wErr } = await db.from('workspaces').insert({ name: workspaceName, created_by: userId }).select('id').single()
    if (wErr) throw wErr
    workspaceId = ws.id
    const { error: uErr } = await db.from('users').insert({
      id: userId, workspace_id: workspaceId, name: adminName, email, role: 'admin', invite_accepted: true, last_active: new Date().toISOString(),
    })
    if (uErr) throw uErr
    console.log('created workspace:', workspaceId)
  }

  // 3. Seed influencers.
  const { inserted, skipped } = await seedInfluencers(db, workspaceId)
  console.log(`seeded influencers: ${inserted} (deduped ${skipped})`)

  const { count } = await db.from('influencers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
  console.log(`influencers in workspace: ${count}`)
  console.log('\nLOGIN:', email, '/', password)
}

main().catch(e => { console.error('BOOTSTRAP FAILED:', e.message ?? e); process.exit(1) })
