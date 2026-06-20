import { createClient } from '@/lib/supabase/server'

export interface Profile {
  id: string
  workspace_id: string
  name: string
  email: string
  role: 'admin' | 'member'
  invite_accepted: boolean
}

// Resolves the logged-in user's profile row (role + workspace). Returns null
// when there's no session, or when the authenticated user has no profile yet
// (i.e. signed up but hasn't completed onboarding) — callers route accordingly.
export async function getProfile(): Promise<{ userId: string; profile: Profile | null } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, workspace_id, name, email, role, invite_accepted')
    .eq('id', user.id)
    .maybeSingle()

  return { userId: user.id, profile: (profile as Profile) ?? null }
}

// Convenience for API routes: throws-style guard that returns the profile or a
// reason. Routes translate `null` into 401/redirect.
export async function requireProfile(): Promise<Profile | null> {
  const res = await getProfile()
  return res?.profile ?? null
}
