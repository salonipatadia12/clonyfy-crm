'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { NavContent } from '@/components/layout/nav-content'

export function MobileHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <span className="sr-only">Open navigation</span>
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[17rem] max-w-[85vw] p-0"
          title="Navigation"
          description="Move between Today, Creators, Campaigns, Outreach, Deliverables, Analytics and Operations."
          hideHeader
        >
          {/* Closing on navigate: without this the drawer stays open over the new page. */}
          <NavContent inDrawer onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-2xs font-bold text-brand-foreground">Cl</span>
      <span className="text-sm font-semibold">Clonify</span>
    </header>
  )
}
