import { cn, getInitials } from '@/lib/utils'

/**
 * Initials avatar on a flat neutral surface.
 *
 * Deliberately not a generated gradient: the redesign uses solid surfaces, and
 * a per-person hue would encode nothing. There is no image variant because the
 * workspace stores no avatar URLs — an <img> here would only ever render a
 * broken one.
 */
export function Avatar({ name, size = 40, className }: {
  name: string
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-medium text-muted-foreground',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {getInitials(name || '?')}
    </span>
  )
}
