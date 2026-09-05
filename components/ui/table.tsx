'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Density = 'compact' | 'comfortable'

const DensityCtx = React.createContext<Density>('comfortable')
export const useDensity = () => React.useContext(DensityCtx)

/** Horizontal scroll container. Wide tables scroll inside themselves; the page body never does. */
export function TableScroll({ className, children, density = 'comfortable' }: {
  className?: string; children: React.ReactNode; density?: Density
}) {
  return (
    <DensityCtx.Provider value={density}>
      <div className={cn('relative w-full overflow-x-auto overscroll-x-contain', className)}>
        {children}
      </div>
    </DensityCtx.Provider>
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('thead-sticky', className)} {...props} />
}

export function TH({ className, align = 'left', ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...props}
    />
  )
}

/** A sortable column header. Sort direction is announced via aria-sort. */
export function SortableTH({
  label, field, sort, order, onSort, align = 'left', className,
}: {
  label: string
  field: string
  sort: string
  order: 'asc' | 'desc'
  onSort: (field: string) => void
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const active = sort === field
  const Icon = !active ? ChevronsUpDown : order === 'asc' ? ArrowUp : ArrowDown
  return (
    <TH align={align} className={className} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm py-0.5 uppercase transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </TH>
  )
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border last:border-0 transition-colors hover:bg-accent/50', className)} {...props} />
}

export function TD({ className, align = 'left', ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  const density = useDensity()
  return (
    <td
      className={cn(
        'px-3 align-middle',
        density === 'compact' ? 'py-1.5' : 'py-2.5',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...props}
    />
  )
}

/** Accessible checkbox styled to the token set. */
export function Checkbox({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-input accent-[hsl(var(--primary))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
}
