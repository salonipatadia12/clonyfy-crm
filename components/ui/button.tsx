import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'link'
type Size = 'default' | 'sm' | 'xs' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  default:   "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
  secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
  outline:   "border border-border bg-card text-foreground hover:bg-accent",
  ghost:     "text-muted-foreground hover:bg-accent hover:text-foreground",
  danger:    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  success:   "bg-success text-success-foreground hover:bg-success/90",
  link:      "text-primary underline-offset-4 hover:underline",
}

const SIZES: Record<Size, string> = {
  lg:      "h-11 px-5 text-sm",
  default: "h-9 px-3.5 text-sm",
  sm:      "h-8 px-3 text-[13px]",
  xs:      "h-7 px-2.5 text-2xs",
  icon:    "h-9 w-9",
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild = false, variant = 'default', size = 'default', type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        // Buttons inside a <form> default to submit, which fires unintended
        // submits from toolbar actions. Only opt in explicitly.
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          VARIANTS[variant], SIZES[size], className,
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
