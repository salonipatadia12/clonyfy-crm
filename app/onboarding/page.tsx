'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createWorkspace, type OnboardingState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? 'Creating workspace & seeding creators…' : 'Create workspace'}
    </Button>
  )
}

export default function OnboardingPage() {
  const [state, formAction] = useActionState<OnboardingState, FormData>(createWorkspace, {})

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&rsquo;ll be the admin of this workspace.
          </p>
        </div>

        <form action={formAction} className="surface space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" required placeholder="Alex Rivera" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace">Workspace name</Label>
            <Input id="workspace" name="workspace" required placeholder="Your agency" />
          </div>
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
