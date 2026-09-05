"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

const SIDES = {
  top:    "inset-x-0 top-0 border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
  bottom: "inset-x-0 bottom-0 border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  left:   "inset-y-0 left-0 h-full border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  right:  "inset-y-0 right-0 h-full border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
} as const

/**
 * `title` and `description` are REQUIRED, not optional.
 *
 * Radix logs an error for any Dialog.Content without a Dialog.Title and warns
 * for a missing Description — the previous version of this component rendered
 * neither, so every drawer in the app produced console errors. Making them
 * required parameters means a new sheet cannot regress. Pass
 * `hideHeader` when the design does not show them; they are still announced.
 */
const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
    side?: keyof typeof SIDES
    title: string
    description: string
    hideHeader?: boolean
    /** Extra content rendered on the header row, right of the title. */
    headerActions?: React.ReactNode
  }
>(({ side = "right", className, children, title, description, hideHeader, headerActions, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/25 data-[state=open]:animate-in data-[state=open]:fade-in" />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col bg-card shadow-xl transition ease-in-out",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-250",
        side === "left" || side === "right" ? "w-full max-w-[min(560px,100vw)]" : "w-full max-h-[92vh]",
        SIDES[side],
        className,
      )}
      {...props}
    >
      {hideHeader ? (
        // Still rendered, just not shown. `asChild` is deliberately NOT used
        // here: Radix passes the generated id down, and a wrapper that drops it
        // re-triggers the very "DialogContent requires a DialogTitle" error this
        // component exists to prevent.
        <>
          <SheetPrimitive.Title className="sr-only">{title}</SheetPrimitive.Title>
          <SheetPrimitive.Description className="sr-only">{description}</SheetPrimitive.Description>
        </>
      ) : (
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <SheetPrimitive.Title className="truncate text-sm font-semibold">{title}</SheetPrimitive.Title>
            <SheetPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">{description}</SheetPrimitive.Description>
          </div>
          {headerActions}
          <SheetPrimitive.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </div>
      )}
      {hideHeader && (
        <SheetPrimitive.Close className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
      {children}
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

export { Sheet, SheetTrigger, SheetClose, SheetContent }
