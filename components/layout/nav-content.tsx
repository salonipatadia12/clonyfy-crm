'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { DemoToggle } from '@/components/crm/demo'
import {
  Sun, Moon, Users, Megaphone, LayoutDashboard, Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { signOut } from '@/lib/auth-actions'
import { Avatar } from '@/components/ui/avatar'
import { NotificationsBell } from '@/components/layout/notifications-bell'

/**
 * Four destinations, matching the four things the product does: see what needs
 * doing, work the list, run a campaign, configure the workspace.
 *
 * Outreach, offers and deliverables are not destinations — they are things you
 * do to an influencer inside a campaign, so they live on the campaign page.
 */
export const PRIMARY_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/influencers', label: 'Influencers', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export const OPERATIONS_NAV: { href: string; label: string; icon: typeof Users; adminOnly: boolean }[] = []

function NavLink({ href, label, icon: Icon, exact, onNavigate }: {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; onNavigate?: () => void
}) {
  const pathname = usePathname() ?? '/'
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/**
 * Shared by the desktop rail and the mobile drawer.
 *
 * The previous build put the desktop `<Sidebar>` — whose root is
 * `hidden md:flex` — inside the mobile sheet, so the drawer rendered nothing
 * and mobile users had no navigation at all. Extracting the content means both
 * surfaces render the same thing and cannot diverge again.
 */
export function NavContent({ onNavigate, inDrawer }: { onNavigate?: () => void; inDrawer?: boolean }) {
  const profile = useAuth()
  const isAdmin = useIsAdmin()
  const { resolvedTheme, setTheme } = useTheme()


  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* In the drawer the sheet renders its own floating close button at the
          top-right, so the header reserves room for it. */}
      <div className={cn('flex items-center gap-2.5 px-4 py-3.5', inDrawer && 'pr-12')}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-brand-foreground">
          Cl
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">Clonify</p>
          <p className="text-2xs text-muted-foreground">Influencer operations</p>
        </div>
        <NotificationsBell />
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2.5 pb-4" aria-label="Main">
        <div className="space-y-0.5">
          {PRIMARY_NAV.map(item => <NavLink key={item.href} {...item} onNavigate={onNavigate} />)}
        </div>
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <DemoToggle />
        {/* Rendered without a mounted flag: both labels exist in the markup and
            CSS picks the right one, so the server and first client render match
            without a setState-in-effect hydration dance. */}
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Moon className="h-4 w-4 dark:hidden" aria-hidden />
          <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
          <span className="dark:hidden">Dark theme</span>
          <span className="hidden dark:inline">Light theme</span>
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-border p-2">
          <Link href="/account" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-0.5 hover:bg-accent">
            <Avatar name={profile.name} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{profile.name}</span>
              <span className="block text-2xs capitalize text-muted-foreground">{isAdmin ? 'Admin' : 'Member'}</span>
            </span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
