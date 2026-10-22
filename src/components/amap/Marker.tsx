import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAMapInstance } from './context'

export interface MarkerProps {
  latitude: number
  longitude: number
  draggable?: boolean
  anchor?: string
  onClick?: () => void
  onDragEnd?: (latitude: number, longitude: number) => void
  children?: ReactNode
}

export function Marker({
  latitude,
  longitude,
  draggable = false,
  anchor = 'bottom-center',
  onClick,
  onDragEnd,
  children,
}: MarkerProps) {
  const map = useAMapInstance()
  const markerRef = useRef<AMap.Marker | null>(null)
  const rootRef = useRef<Root | null>(null)
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd
  const childrenRef = useRef(children)
  childrenRef.current = children

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'amap-marker'
    el.style.cursor = 'pointer'
    const root = createRoot(el)
    const marker = new AMap.Marker({
      position: [longitude, latitude],
      content: el,
      anchor,
      draggable,
      zIndex: 120,
    })
    marker.setMap(map)
    marker.on('click', () => onClickRef.current?.())
    marker.on('dragend', () => {
      const position = marker.getPosition()
      if (position) onDragEndRef.current?.(position.getLat(), position.getLng())
    })
    markerRef.current = marker
    rootRef.current = root
    root.render(childrenRef.current)
    return () => {
      marker.setMap(null)
      marker.destroy()
      markerRef.current = null
      rootRef.current = null
      // React 19 在提交阶段禁止同步 unmount 子 root，延迟到下一轮宏任务
      setTimeout(() => root.unmount(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, draggable, anchor])

  useEffect(() => {
    markerRef.current?.setPosition([longitude, latitude])
  }, [longitude, latitude])

  useLayoutEffect(() => {
    rootRef.current?.render(children)
  })

  return null
}
