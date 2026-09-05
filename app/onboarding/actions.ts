'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedInfluencers } from '@/lib/seed'

export interface OnboardingState {
  error?: string
}

// First-login bootstrap (spec §1): the signed-up user creates a workspace,
// becomes its admin, and the influencers table is seeded from the CSV. Runs via
// the service-role client because no profile/workspace exists yet to satisfy RLS.
export async function createWorkspace(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const workspaceName = String(formData.get('workspace') ?? '').trim()
  const adminName = String(formData.get('name') ?? '').trim()
  if (!workspaceName) return { error: 'Workspace name is required' }
  if (!adminName) return { error: 'Your name is required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()

  // Already onboarded? Go straight to the dashboard.
  const { data: existing } = await admin.from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) redirect('/')

  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({ name: workspaceName, created_by: user.id })
    .select('id')
    .single()
  if (wsErr || !ws) return { error: `Could not create workspace: ${wsErr?.message}` }

  const { error: userErr } = await admin.from('users').insert({
    id: user.id,
    workspace_id: ws.id,
    name: adminName,
    email: user.email ?? '',
    role: 'admin',
    invite_accepted: true,
    last_active: new Date().toISOString(),
  })
  if (userErr) return { error: `Could not create admin profile: ${userErr.message}` }

  try {
    await seedInfluencers(admin, ws.id)
  } catch (e) {
    // Workspace + admin exist; surface seed failure but don't block login.
    return { error: `Workspace created, but seeding failed: ${e instanceof Error ? e.message : e}. You can retry seeding from Settings.` }
  }

  redirect('/')
}
