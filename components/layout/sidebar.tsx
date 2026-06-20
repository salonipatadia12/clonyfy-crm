'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Users,
  Kanban,
  Handshake,
  BarChart3,
  FileText,
  History,
  Moon,
  Sun,
  Sparkles,
  LogOut,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { signOut } from '@/lib/auth-actions'
import { Avatar } from '@/components/ui/avatar'
import { NotificationsBell } from '@/components/layout/notifications-bell'

const NAV = [
  { href: '/', label: 'Command Center', icon: LayoutDashboard },
  { href: '/crm/influencers', label: 'Influencers', icon: Users },
  { href: '/crm/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/crm/deals', label: 'Deals', icon: Handshake },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]
const ADMIN_NAV = [
  { href: '/team', label: 'Team', icon: UserCog },
  { href: '/audit', label: 'Audit', icon: History },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = !mounted || theme === 'dark' // stable on server + first client render
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href))
  const profile = useAuth()
  const isAdmin = useIsAdmin()

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 border-r border-border/60 bg-card/40 backdrop-blur-xl z-30">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-600/30">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight tracking-tight">Clonyfy</h1>
          <p className="text-[11px] text-muted-foreground">Influencer CRM</p>
        </div>
        <NotificationsBell />
      </div>

      <nav className="flex-1 px-3">
        <p className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Workspace
        </p>
        <div className="space-y-1">
          {[...NAV, ...(isAdmin ? ADMIN_NAV : [])].map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
                <Icon className={cn('h-[18px] w-[18px]', active && 'text-primary')} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="space-y-2 p-4">
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>

        <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 p-2.5">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-0.5 hover:bg-muted/40" title="Account settings">
            <Avatar name={profile.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.name}</p>
              <p className="text-[11px] capitalize text-muted-foreground">{isAdmin ? 'Admin' : 'Member'}</p>
            </div>
          </Link>
          <form action={signOut}>
            <button type="submit" title="Sign out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
