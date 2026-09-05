import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Layout classes for the wrapper. Width belongs here, not on `className`:
   * the wrapper is what the surrounding flex/grid lays out, so putting `w-40`
   * on the inner <select> leaves a full-width wrapper and stacks the filters.
   */
  containerClassName?: string
}

/**
 * Native <select>. Deliberate: it is keyboard- and screen-reader-correct for
 * free, works inside scroll containers with no portal, and gives mobile users
 * the platform picker. Radix Select is reserved for cases needing rich options.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => (
    // The id lands on the <select>, not this wrapper, so a <label htmlFor>
    // points at the control a user actually operates.
    <div className={cn('relative inline-flex w-full min-w-0', containerClassName)}>
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-8 text-sm text-foreground",
          "transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
)
Select.displayName = "Select"
