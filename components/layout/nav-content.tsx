'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { DemoToggle } from '@/components/crm/demo'
import {
  Sun, Moon, Users, Megaphone, Send, PackageCheck, BarChart3, CalendarCheck,
  Building2, Radar, ShieldCheck, UserCog, FileText, History, Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { signOut } from '@/lib/auth-actions'
import { Avatar } from '@/components/ui/avatar'
import { NotificationsBell } from '@/components/layout/notifications-bell'

/**
 * The operational hierarchy. Six primary destinations that match the job:
 * what needs doing, who to work with, what we're running, reaching out,
 * shipping the content, and did it work. Everything administrative is grouped
 * under Operations so it stops competing with daily work.
 */
export const PRIMARY_NAV = [
  { href: '/', label: 'Today', icon: CalendarCheck, exact: true },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/deliverables', label: 'Deliverables', icon: PackageCheck },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export const OPERATIONS_NAV = [
  { href: '/clients', label: 'Clients & products', icon: Building2, adminOnly: false },
  { href: '/operations/data-quality', label: 'Data quality', icon: ShieldCheck, adminOnly: true },
  { href: '/templates', label: 'Templates', icon: FileText, adminOnly: false },
  { href: '/sourcing', label: 'Sourcing', icon: Radar, adminOnly: true },
  { href: '/team', label: 'Team', icon: UserCog, adminOnly: true },
  { href: '/audit', label: 'Audit', icon: History, adminOnly: true },
  { href: '/account', label: 'Account', icon: Settings, adminOnly: false },
]

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

  const ops = OPERATIONS_NAV.filter(n => !n.adminOnly || isAdmin)

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
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Operations</p>
          {ops.map(item => <NavLink key={item.href} {...item} onNavigate={onNavigate} />)}
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
