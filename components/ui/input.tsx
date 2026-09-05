import * as React from "react"
import { cn } from "@/lib/utils"

export const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground/80 transition-colors " +
  "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 " +
  "disabled:cursor-not-allowed disabled:opacity-60"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputClass, className)} {...props} />
  )
)
Input.displayName = "Input"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, "h-auto min-h-[80px] py-2 leading-relaxed", className)} {...props} />
  )
)
Textarea.displayName = "Textarea"

export { Input, Textarea }
