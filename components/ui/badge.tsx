import * as React from "react"
import { cn } from "@/lib/utils"

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'outline' | 'solid'

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info:    "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger:  "border-destructive/25 bg-destructive/10 text-destructive",
  outline: "border-border bg-transparent text-foreground",
  solid:   "border-transparent bg-primary text-primary-foreground",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

/**
 * Status pill. Always carries a text label — badges never encode meaning with
 * colour alone, so they stay readable to colour-blind users and in print.
 */
export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium leading-4 whitespace-nowrap",
        TONES[tone], className,
      )}
      {...props}
    />
  )
}
