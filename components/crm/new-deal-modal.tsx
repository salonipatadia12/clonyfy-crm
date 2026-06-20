'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { usePipeline, useCreateDeal } from '@/lib/api'
import { formatFollowers } from '@/lib/utils'
import { Search, Check } from 'lucide-react'
import { toast } from 'sonner'

export function NewDealModal({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (dealId: string) => void
}) {
  const { data } = usePipeline({})
  const create = useCreateDeal()
  const [search, setSearch] = useState('')
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [title, setTitle] = useState('Collaboration')
  const [videos, setVideos] = useState('1')

  const rows = data?.rows ?? []
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => !q || r.handle.toLowerCase().includes(q) || (r.full_name ?? '').toLowerCase().includes(q)).slice(0, 40)
  }, [rows, search])

  const submit = () => {
    if (!pipelineId) { toast.error('Pick a creator from your pipeline'); return }
    create.mutate({ pipeline_id: pipelineId, title, videos_planned: Number(videos) || 1 }, {
      onSuccess: (r) => {
        toast.success('Deal created')
        onOpenChange(false); setPipelineId(null); setSearch(''); setTitle('Collaboration'); setVideos('1')
        onCreated?.(r.deal.id)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create deal'),
    })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New deal" description="Start a deal with a creator already in your pipeline.">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your pipeline…" className="pl-9" />
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No pipeline creators match. Add creators to your pipeline first.</p>
          ) : filtered.map(r => (
            <button key={r.id} onClick={() => setPipelineId(r.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted ${pipelineId === r.id ? 'bg-primary/10' : ''}`}>
              <Avatar name={r.full_name || r.handle} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.full_name || r.handle}</p>
                <p className="truncate text-xs text-muted-foreground">@{r.handle} · {formatFollowers(r.follower_count)}</p>
              </div>
              {pipelineId === r.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
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
        <Button onClick={submit} disabled={create.isPending || !pipelineId} className="w-full">{create.isPending ? 'Creating…' : 'Create deal'}</Button>
      </div>
    </Modal>
  )
}
