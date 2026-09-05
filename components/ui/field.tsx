'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Label + optional hint wrapper.
 *
 * The label is associated by id rather than by wrapping the control. A wrapping
 * <label> makes a <select>'s accessible name include every option's text
 * ("CampaignChoose a campaign…Acme…"), which is what a screen reader would
 * announce. Cloning an id onto the single child keeps the association explicit.
 */
export function Labelled({ label, hint, required, children, className }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  const generated = React.useId()
  const child = React.isValidElement(children) ? children : null
  const childProps = (child?.props ?? {}) as { id?: string }
  const id = childProps.id ?? generated
  const control = child
    ? React.cloneElement(child as React.ReactElement<{ id?: string }>, { id })
    : children

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[13px] font-medium text-foreground">
          {label}{required && <span className="text-destructive" aria-hidden> *</span>}
        </span>
        {hint && <span className="text-2xs font-normal text-muted-foreground">{hint}</span>}
      </label>
      {control}
    </div>
  )
}

/** Multi-select rendered as toggle chips — clearer than a native multi-select. */
export function ChipGroup<T extends string>({ options, value, onChange, ariaLabel }: {
  options: readonly { value: T; label: string }[]
  value: T[]
  onChange: (next: T[]) => void
  ariaLabel: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map(o => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter(v => v !== o.value) : [...value, o.value])}
            className={cn(
              'rounded-md border px-2.5 py-1 text-[13px] transition-colors',
              on
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
