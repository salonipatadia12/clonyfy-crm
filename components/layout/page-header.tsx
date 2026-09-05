import { cn } from '@/lib/utils'

/** Consistent page title block: one h1, optional subtitle, right-aligned actions. */
export function PageHeader({
  title, titleBadge, description, actions, className, children,
}: {
  title: string
  /** Rendered next to the h1 — a provenance chip, not a second heading. */
  titleBadge?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-[1.4rem]">{title}</h1>
          {titleBadge}
        </div>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
