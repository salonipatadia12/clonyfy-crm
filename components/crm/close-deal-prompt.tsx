'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { useCreateDeal } from '@/lib/api'
import { PartyPopper, Handshake } from 'lucide-react'
import { toast } from 'sonner'

export interface CloseTarget {
  pipelineId: string
  handle: string
  fullName?: string | null
}

// Fires the moment a lead lands in "Closed" — turns the win into a deal right
// then and there so it never slips to "I'll batch these later".
export function CloseDealPrompt({ target, onOpenChange }: {
  target: CloseTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateDeal()
  const [title, setTitle] = useState('Collaboration')
  const [videos, setVideos] = useState('1')

  // Reset the form whenever a new creator is closed.
  useEffect(() => {
    if (target) { setTitle('Collaboration'); setVideos('1') }
  }, [target])

  const name = target?.fullName || target?.handle || 'this creator'

  const submit = () => {
    if (!target) return
    create.mutate({ pipeline_id: target.pipelineId, title, videos_planned: Number(videos) || 1 }, {
      onSuccess: () => { toast.success(`Deal started with ${name}`); onOpenChange(false) },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create deal'),
    })
  }

  return (
    <Modal
      open={!!target}
      onOpenChange={onOpenChange}
      title="🎉 Lead closed — lock in the deal"
      description="You just moved this creator to Closed. Create the deal now so the deliverables are tracked and nothing slips."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <PartyPopper className="h-5 w-5" />
          </div>
          {target && (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={name} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">@{target.handle}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Deal title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Collaboration" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Videos planned</label>
            <Input type="number" min={1} value={videos} onChange={(e) => setVideos(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">Later</Button>
          <Button onClick={submit} disabled={create.isPending} className="flex-1 gap-1.5">
            <Handshake className="h-4 w-4" /> {create.isPending ? 'Creating…' : 'Create deal'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
