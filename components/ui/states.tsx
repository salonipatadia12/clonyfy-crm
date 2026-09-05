'use client'

import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Action-oriented empty state. An empty screen must always tell the user what
 * to do next — a bare "No results" is a dead end.
 */
export function EmptyState({
  icon: Icon, title, description, actions, className, compact,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 text-center',
      compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      className,
    )}>
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

/** Descriptive error with a retry. Shows the real message, not "Something went wrong". */
export function ErrorState({
  title = 'Could not load this', error, onRetry, className, compact,
}: {
  title?: string
  error?: unknown
  onRetry?: () => void
  className?: string
  compact?: boolean
}) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 text-center',
      compact ? 'px-4 py-6' : 'px-6 py-12',
      className,
    )} role="alert">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {message && <p className="text-[13px] leading-relaxed text-muted-foreground break-words">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}

/**
 * Skeleton block. Loading placeholders mirror the real layout's dimensions so
 * nothing jumps when data arrives.
 */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-px" aria-busy="true" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className={cn('h-4', c === 0 ? 'w-48' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({ count = 4, height = 'h-24' }: { count?: number; height?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <Shimmer key={i} className={cn('rounded-xl', height)} />)}
    </div>
  )
}

/**
 * Wraps a disabled primary action with the reason it is disabled. A disabled
 * button with no explanation is a dead end; the reason is exposed both as a
 * tooltip and as text for assistive tech.
 */
export function DisabledHint({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <span className="inline-flex flex-col items-start gap-1" title={reason}>
      {children}
      <span className="text-2xs text-muted-foreground">{reason}</span>
    </span>
  )
}
