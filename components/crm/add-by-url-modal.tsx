'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { fetchProfile, useAddByUrl, type ProfilePreview } from '@/lib/api'
import { formatFollowers } from '@/lib/utils'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

export function AddByUrlModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ProfilePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addByUrl = useAddByUrl()

  const reset = () => { setUrl(''); setPreview(null); setError(null); setLoading(false) }
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o) }

  const onFetch = async () => {
    if (!url.trim()) return
    setLoading(true); setError(null)
    try {
      const p = await fetchProfile(url.trim())
      setPreview(p)
    } catch {
      setError('Could not read that profile. Check the handle or URL.')
    } finally { setLoading(false) }
  }

  const onConfirm = (toPipeline: boolean) => {
    if (!preview) return
    addByUrl.mutate(
      { handle: preview.handle, name: preview.name, profile_url: preview.profile_url, follower_count: preview.follower_count, biography: preview.biography, addToPipeline: toPipeline },
      {
        onSuccess: (r) => {
          toast.success(r.created ? `Added @${preview.handle}` : `@${preview.handle} already existed${toPipeline ? ' — added to pipeline' : ''}`)
          close(false)
        },
        onError: () => toast.error('Failed to add creator'),
      }
    )
  }

  return (
    <Modal open={open} onOpenChange={close} title="Add creator by URL" description="Paste an Instagram profile link or @handle.">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onFetch() }}
              placeholder="instagram.com/username"
              className="pl-9"
            />
          </div>
          <Button onClick={onFetch} disabled={loading || !url.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {preview && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={preview.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{preview.name}</p>
                <p className="truncate text-xs text-muted-foreground">@{preview.handle}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatFollowers(preview.follower_count)}</p>
                <p className="text-[11px] text-muted-foreground">{preview.fetched ? 'followers' : 'not fetched'}</p>
              </div>
            </div>
            {preview.biography && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{preview.biography}</p>}
            {!preview.fetched && (
              <p className="mt-2 text-[11px] text-amber-400">Instagram blocked the lookup — the creator will be added with just the handle. You can fill details later.</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => onConfirm(false)} disabled={addByUrl.isPending} variant="ghost" className="flex-1 border border-border">Add to list</Button>
              <Button onClick={() => onConfirm(true)} disabled={addByUrl.isPending} className="flex-1">Add + Pipeline</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
