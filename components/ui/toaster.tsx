"use client"

import { Toaster as Sonner } from "sonner"
import { useTheme } from "next-themes"

export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "dark"}
      position="bottom-right"
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border bg-card text-card-foreground",
        },
      }}
    />
  )
}
