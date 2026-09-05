'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { MobileHeader } from '@/components/layout/mobile-header'
import { Toaster } from '@/components/ui/toaster'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <div className="md:ml-60">
        <MobileHeader />
        <main className="mx-auto w-full max-w-[1440px] p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
