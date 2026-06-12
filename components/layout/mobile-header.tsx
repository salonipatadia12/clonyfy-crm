'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './sidebar'

export function MobileHeader() {
  return (
    <div className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm">
            <Menu size={20} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-600"></div>
        <h1 className="font-bold">Clonyfy</h1>
      </div>
    </div>
  )
}
