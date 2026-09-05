'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Centred dialog. `title` is required and `description` strongly encouraged —
 * Radix needs both for an accessible dialog, and a modal with no one-line
 * explanation of what it does is a usability problem regardless.
 *
 * The panel is height-capped and scrolls internally so it always fits a 390px
 * viewport with the primary action visible.
 */
export function Modal({
  open, onOpenChange, title, description, children, footer, className, size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-border bg-card shadow-xl focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in',
            width, className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
              {description
                ? <Dialog.Description className="mt-0.5 text-[13px] text-muted-foreground">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
