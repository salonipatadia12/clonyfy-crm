'use client'

import Link from 'next/link'
import { Building2, UserCog, ShieldCheck, History, Radar, User, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { useIsAdmin } from '@/lib/auth-context'

/**
 * Everything that is configured once and then left alone.
 *
 * These were seven separate items in the sidebar competing with daily work.
 * They are all still here, one click further away, which is the right distance
 * for something you touch once a month.
 */
const SECTIONS = [
  {
    href: '/clients',
    label: 'Clients and products',
    description: 'Who you run campaigns for, and what you are promoting.',
    icon: Building2,
    adminOnly: false,
  },
  {
    href: '/account',
    label: 'Your account',
    description: 'Your name and password.',
    icon: User,
    adminOnly: false,
  },
  {
    href: '/team',
    label: 'Team',
    description: 'Invite people and set who can change what.',
    icon: UserCog,
    adminOnly: true,
  },
  {
    href: '/operations/data-quality',
    label: 'Data quality',
    description: 'What is actually known about your influencer list.',
    icon: ShieldCheck,
    adminOnly: true,
  },
  {
    href: '/sourcing',
    label: 'Find new influencers',
    description: 'Add influencers to the list from a profile URL or a search.',
    icon: Radar,
    adminOnly: true,
  },
  {
    href: '/audit',
    label: 'Activity log',
    description: 'Who changed what, and when.',
    icon: History,
    adminOnly: true,
  },
]

export default function SettingsPage() {
  const isAdmin = useIsAdmin()
  const sections = SECTIONS.filter(s => !s.adminOnly || isAdmin)

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Set up once, then get on with the work." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(s => (
          <Link
            key={s.href}
            href={s.href}
            className="surface flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{s.label}</span>
              <span className="block text-2xs leading-relaxed text-muted-foreground">{s.description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  )
}
