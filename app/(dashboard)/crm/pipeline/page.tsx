'use client'

import { PipelineBoard } from '@/components/crm/pipeline-board'

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag creators between stages to track outreach. Showing the 400 most recently updated.
        </p>
      </header>
      <PipelineBoard />
    </div>
  )
}
