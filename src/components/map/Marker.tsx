import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Marker as MlMarker } from 'maplibre-gl'
import { useMapInstance } from './context'

export interface MarkerProps {
  latitude: number
  longitude: number
  draggable?: boolean
  onClick?: () => void
  onDragEnd?: (latitude: number, longitude: number) => void
  children?: ReactNode
}

export function Marker({ latitude, longitude, draggable = false, onClick, onDragEnd, children }: MarkerProps) {
  const map = useMapInstance()
  const markerRef = useRef<MlMarker | null>(null)
  const rootRef = useRef<Root | null>(null)
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick
  const childrenRef = useRef(children)
  childrenRef.current = children

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'map-marker'
    el.style.cursor = 'pointer'
    const root = createRoot(el)
    const marker = new MlMarker({ element: el, draggable, anchor: 'center' })
      .setLngLat([longitude, latitude])
      .addTo(map)
    el.addEventListener('click', () => onClickRef.current?.())
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat()
      onDragEnd?.(lngLat.lat, lngLat.lng)
    })
    markerRef.current = marker
    rootRef.current = root
    root.render(childrenRef.current)
    return () => {
      marker.remove()
      const pendingRoot = root
      markerRef.current = null
      rootRef.current = null
      // React 19 在提交阶段禁止同步 unmount 子 root，延迟到下一轮宏任务
      setTimeout(() => pendingRoot.unmount(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, draggable])

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude])
  }, [longitude, latitude])

  useLayoutEffect(() => {
    rootRef.current?.render(children)
  })

  return null
}

export function MarkerContent({ children }: { children?: ReactNode }) {
  return <div className="group relative flex items-center justify-center">{children}</div>
}

export function MarkerDot({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <div className="pointer-events-none relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full opacity-60 blur-[10px] transition-transform duration-300 group-hover:scale-110"
        style={{ backgroundColor: color }}
      />
      <div
        className="absolute inset-[16%] rounded-full transition-transform duration-300 group-hover:scale-105"
        style={{
          background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%), ${color}`,
          boxShadow: 'inset 0 0 8px rgba(255,255,255,0.35)',
        }}
      />
    </div>
  )
}

export function MarkerLabel({ children }: { children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-full mt-1 max-w-32 truncate text-center text-[11px] font-medium text-foreground/90 drop-shadow-sm">
      {children}
    </div>
  )
}

export function MarkerTooltip({ children }: { children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
      {children}
    </div>
  )
}
