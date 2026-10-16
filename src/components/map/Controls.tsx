import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ControlPosition, IControl } from 'maplibre-gl'
import { Compass, Minus, Plus } from 'lucide-react'
import { useMapInstance } from './context'

export function Controls({ position = 'top-right', children }: { position?: ControlPosition; children?: ReactNode }) {
  const map = useMapInstance()
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'map-controls-host'
    const control: IControl = {
      onAdd: () => el,
      onRemove: () => el.remove(),
      getDefaultPosition: () => position,
    }
    map.addControl(control, position)
    setHost(el)
    return () => {
      map.removeControl(control)
      setHost(null)
    }
  }, [map, position])

  if (!host) return null
  return createPortal(<div className="flex flex-col items-center gap-2">{children}</div>, host)
}

export function ZoomControl() {
  const map = useMapInstance()
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-separator bg-surface shadow-sm">
      <button
        type="button"
        aria-label="放大"
        onClick={() => map.zoomIn()}
        className="flex size-8 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-surface-secondary"
      >
        <Plus className="size-4" />
      </button>
      <div className="mx-2 h-px bg-separator" />
      <button
        type="button"
        aria-label="缩小"
        onClick={() => map.zoomOut()}
        className="flex size-8 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-surface-secondary"
      >
        <Minus className="size-4" />
      </button>
    </div>
  )
}

export function CompassControl() {
  const map = useMapInstance()
  const [bearing, setBearing] = useState(map.getBearing())
  useEffect(() => {
    const onRotate = () => setBearing(map.getBearing())
    map.on('rotate', onRotate)
    return () => {
      map.off('rotate', onRotate)
    }
  }, [map])
  return (
    <button
      type="button"
      aria-label="重置朝向"
      onClick={() => map.resetNorth()}
      className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-separator bg-surface text-foreground shadow-sm transition-colors hover:bg-surface-secondary"
    >
      <Compass className="size-4 transition-transform duration-100" style={{ transform: `rotate(${-bearing}deg)` }} />
    </button>
  )
}
