'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { useInfluencers, useAddDeal } from '@/lib/api'
import { Search } from 'lucide-react'
import { toast } from 'sonner'

export function NewDealModal({
  open, onOpenChange, presetId, presetName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  presetId?: string
  presetName?: string
}) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(presetId ? { id: presetId, name: presetName || presetId } : null)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'active' | 'completed' | 'cancelled'>('active')
  const addDeal = useAddDeal()

  const { data } = useInfluencers({ search: q || undefined, pageSize: 6, sort: 'follower_count', order: 'desc' })
  const results = q.length >= 2 ? (data?.rows ?? []) : []

  const reset = () => { if (!presetId) setPicked(null); setQ(''); setTitle(''); setValue(''); setStatus('active') }
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o) }

  const submit = () => {
    if (!picked || !title.trim()) return
    addDeal.mutate(
      { influencer_id: picked.id, title: title.trim(), deal_value: value ? Number(value) : null, status },
      { onSuccess: () => { toast.success('Deal created'); close(false) }, onError: () => toast.error('Failed to create deal') }
    )
  }

  return (
    <Modal open={open} onOpenChange={close} title="New deal" description="Log a collaboration with a creator.">
      <div className="space-y-3">
        {picked ? (
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-2.5">
            <div className="flex items-center gap-2">
              <Avatar name={picked.name} size={32} />
              <span className="text-sm font-medium">{picked.name}</span>
            </div>
            {!presetId && <button onClick={() => setPicked(null)} className="text-xs text-muted-foreground hover:text-foreground">Change</button>}
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a creator…" className="pl-9" />
            </div>
            {results.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover p-1">
                {results.map(r => (
                  <button key={r.id} onClick={() => { setPicked({ id: r.id, name: r.name }); setQ('') }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <Avatar name={r.name} size={26} />
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">@{r.handle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title (e.g. Sponsored Reel)" />
        <div className="flex gap-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (USD)" type="number" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-40">
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={submit} disabled={addDeal.isPending || !picked || !title.trim()}>Create deal</Button>
        </div>
      </div>
    </Modal>
  )
}
