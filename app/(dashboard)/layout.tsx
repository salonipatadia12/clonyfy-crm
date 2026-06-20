import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { AuthProvider } from '@/lib/auth-context'
import { AppShell } from '@/components/layout/app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getProfile()
  // Middleware already bounces unauthenticated users to /login; this also
  // covers a signed-up user who hasn't created their workspace yet.
  if (!session) redirect('/login')
  if (!session.profile) redirect('/onboarding')

  return (
    <AuthProvider profile={session.profile}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
