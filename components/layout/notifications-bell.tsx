'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications, useMarkNotifications } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export function NotificationsBell() {
  const { data } = useNotifications()
  const mark = useMarkNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = data?.unread ?? 0
  const rows = data?.rows ?? []

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications {unread > 0 && <span className="ml-1 text-xs font-normal text-primary">({unread} new)</span>}</span>
            {unread > 0 && (
              <button onClick={() => mark.mutate(undefined)} disabled={mark.isPending}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : rows.map(n => (
              <div key={n.id} className={cn('flex items-start gap-2 border-b border-border px-4 py-3 last:border-0', !n.read && 'bg-primary/5')}>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <div className={cn('min-w-0 flex-1', n.read && 'pl-4')}>
                  <p className="text-sm">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
