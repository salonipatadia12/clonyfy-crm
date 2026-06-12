'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { MobileHeader } from '@/components/layout/mobile-header'
import { Toaster } from '@/components/ui/toaster'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="app-canvas min-h-screen">
      <Sidebar />
      <div className="md:ml-64">
        <MobileHeader />
        <main className="mx-auto max-w-[1500px] p-5 md:p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
