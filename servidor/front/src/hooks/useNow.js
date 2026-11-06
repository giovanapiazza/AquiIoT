import { useEffect, useState } from 'react'

// Relógio para textos relativos ("há 12 s"), atualizado a cada `ms`
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}
