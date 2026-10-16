import { useRef, type PointerEvent, type ReactNode } from 'react'

export default function GlassTilt({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    el.style.setProperty('--pointer-x', `${x}%`)
    el.style.setProperty('--pointer-y', `${y}%`)
    el.style.setProperty('--shine-opacity', '1')
    const rotateX = ((y / 100 - 0.5) * -12).toFixed(2)
    const rotateY = ((x / 100 - 0.5) * 12).toFixed(2)
    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
  }

  const handlePointerLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--shine-opacity', '0')
    el.style.transform = ''
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative will-change-transform [transition:transform_.15s_ease-out] ${className}`}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 [border-radius:inherit] [background:radial-gradient(farthest-corner_circle_at_var(--pointer-x,50%)_var(--pointer-y,50%),rgba(255,255,255,0.6),rgba(255,255,255,0.18)_40%,transparent_72%)] mix-blend-soft-light [opacity:var(--shine-opacity,0)] [transition:opacity_.3s_ease-out]"
      />
    </div>
  )
}
