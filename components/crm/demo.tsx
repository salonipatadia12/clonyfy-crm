'use client'

import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const COOKIE = 'clonify_demo'

/**
 * A row created by the demo seed.
 *
 * Deliberately quiet: a small outlined chip, not a colour wash. The point is
 * that a person reading a number can tell whether it is real, and that costs
 * nothing if it does not shout.
 */
export function DemoBadge({ on, className }: { on?: string | null; className?: string }) {
  if (!on) return null
  return (
    <Badge tone="neutral" className={cn('border-dashed', className)} title="Simulated record created by the demo seed. Not real client, campaign or performance data.">
      Demo
    </Badge>
  )
}

/**
 * The cookie is the source of truth because the server applies the filter.
 * Read through useSyncExternalStore rather than an effect, so the first client
 * render already agrees with the cookie instead of flashing the wrong label.
 */
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const readCookie = () =>
  typeof document === 'undefined' || !document.cookie.split('; ').some(c => c === `${COOKIE}=off`)
// The server renders with demo data visible; hydration corrects it if hidden.
const serverSnapshot = () => true

/**
 * Include/exclude simulated records, workspace-wide.
 *
 * Stored in a cookie rather than React state because the filter is applied on
 * the server, at the four query chokepoints in `lib/crm.ts` — a client-side
 * filter would leave demo rows in counts and aggregates.
 */
export function DemoToggle() {
  const qc = useQueryClient()
  const show = useSyncExternalStore(subscribe, readCookie, serverSnapshot)

  const toggle = () => {
    document.cookie = `${COOKIE}=${show ? 'off' : 'on'}; path=/; max-age=31536000; samesite=lax`
    for (const fn of listeners) fn()
    qc.invalidateQueries()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={show}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-2xs font-medium transition-colors',
        show
          ? 'border-dashed border-border bg-muted/60 text-muted-foreground hover:text-foreground'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
      title={show
        ? 'Simulated demo records are included in every list and metric. Click to hide them.'
        : 'Simulated demo records are hidden. Click to show them.'}
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      {show ? 'Demo data on' : 'Demo data off'}
    </button>
  )
}
