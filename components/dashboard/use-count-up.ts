'use client'

import { useEffect, useRef, useState } from 'react'

// Animate a number from its previous value to the target with an ease-out curve.
export function useCountUp(target: number, duration = 1100) {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = fromRef.current
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = from + (target - from) * eased
      fromRef.current = cur
      setVal(cur)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return val
}
