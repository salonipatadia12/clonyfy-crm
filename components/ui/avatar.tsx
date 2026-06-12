import { cn, getInitials } from '@/lib/utils'

// Deterministic gradient avatar from a name/handle — vivid on dark backgrounds.
function hueFrom(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const h = hueFrom(name || '?')
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.36,
    background: `linear-gradient(135deg, hsl(${h} 70% 52%), hsl(${(h + 50) % 360} 75% 42%))`,
  }
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-inner ring-1 ring-white/10', className)}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={name} className="h-full w-full rounded-full object-cover" /> : getInitials(name || '?')}
    </div>
  )
}
