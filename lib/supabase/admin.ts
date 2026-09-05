import { createClient } from '@supabase/supabase-js'

// Service-role client — BYPASSES RLS. Server-only. Use sparingly: bootstrapping
// a workspace, seeding influencers, and admin tasks that must cross RLS (e.g.
// inviting members, writing notifications for another user). Never import this
// into client components or unauthenticated routes.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
