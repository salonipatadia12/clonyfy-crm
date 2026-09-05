'use client'

import { NavContent } from '@/components/layout/nav-content'

/** Desktop navigation rail. The mobile drawer renders the same NavContent. */
export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-dvh w-60 border-r border-border bg-card md:block">
      <NavContent />
    </aside>
  )
}
