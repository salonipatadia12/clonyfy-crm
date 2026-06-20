'use client'

import { TemplatesManager } from '@/components/crm/templates-manager'

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create and manage reusable DM templates for outreach. Shared across the workspace.</p>
      </header>
      <TemplatesManager />
    </div>
  )
}
