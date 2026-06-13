'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useUpdateDeal } from '@/lib/api'
import { formatMoney, formatNum, safeUrl } from '@/lib/utils'
import { ExternalLink, Film } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import type { Collaboration } from '@/types/database'

export function DealDrawer({ deal, onOpenChange }: { deal: Collaboration | null; onOpenChange: (o: boolean) => void }) {
  const updateDeal = useUpdateDeal()
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('active')
  const [reel, setReel] = useState('')
  const [views, setViews] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (deal) {
      setValue(deal.deal_value != null ? String(deal.deal_value) : '')
      setStatus(deal.status)
      setReel(deal.reel_url ?? '')
      setViews(deal.reel_views != null ? String(deal.reel_views) : '')
      setNotes(deal.notes ?? '')
    }
  }, [deal])

  if (!deal) return <Sheet open={false} onOpenChange={onOpenChange}><SheetContent side="right" className="sm:max-w-[480px]" /></Sheet>

  const save = (patch: Record<string, unknown>, msg = 'Saved') =>
    updateDeal.mutate({ id: deal.id, patch }, { onSuccess: () => toast.success(msg) })

  const ig = safeUrl(`https://www.instagram.com/${deal.influencer_handle}/`)
  const reelUrl = safeUrl(deal.reel_url)

  return (
    <Sheet open={!!deal} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[480px]">
        <div className="border-b border-border/60 bg-gradient-to-br from-violet-500/15 to-transparent p-6">
          <div className="flex items-center gap-3">
            <Avatar name={deal.influencer_name || deal.influencer_handle || '?'} size={48} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{deal.influencer_name}</p>
              <p className="text-xs text-muted-foreground">@{deal.influencer_handle}</p>
            </div>
            {ig && <a href={ig} target="_blank" rel="noreferrer noopener" className="ml-auto rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
          </div>
          <h2 className="mt-4 text-xl font-bold">{deal.title}</h2>
          <p className="text-sm text-muted-foreground">Created {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}</p>
        </div>

        <div className="space-y-4 p-6">
          <Field label="Deal value">
            <div className="flex gap-2">
              <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" placeholder="0" />
              <Button variant="ghost" onClick={() => save({ deal_value: value ? Number(value) : null })} className="border border-border">Save</Button>
            </div>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); save({ status: e.target.value }, 'Status updated') }} className="w-full">
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>

          <Field label="Reel URL">
            <div className="flex gap-2">
              <Input value={reel} onChange={(e) => setReel(e.target.value)} placeholder="https://instagram.com/reel/…" />
              <Button variant="ghost" onClick={() => save({ reel_url: reel || null })} className="border border-border">Save</Button>
            </div>
            {reelUrl && <a href={reelUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><Film className="h-3 w-3" /> Open reel</a>}
          </Field>

          <Field label="Reel views">
            <div className="flex gap-2">
              <Input value={views} onChange={(e) => setViews(e.target.value)} type="number" placeholder="Enter manually" />
              <Button variant="ghost" onClick={() => save({ reel_views: views ? Number(views) : null })} className="border border-border">Save</Button>
            </div>
            {deal.reel_views != null && <p className="mt-1 text-xs text-muted-foreground">{formatNum(deal.reel_views)} views recorded</p>}
          </Field>

          <Field label="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (deal.notes ?? '')) save({ notes: notes || null }, 'Notes saved') }}
              rows={4} placeholder="Free text…"
              className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{formatMoney(deal.deal_value, deal.currency)}</p>
            <p className="text-xs text-muted-foreground capitalize">{deal.status} deal</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
