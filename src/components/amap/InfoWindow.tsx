import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { X } from 'lucide-react'
import { useAMapInstance } from './context'

export interface InfoWindowProps {
  latitude: number
  longitude: number
  visible?: boolean
  onClose?: () => void
  children?: ReactNode
}

export function InfoWindow({
  latitude,
  longitude,
  visible = true,
  onClose,
  children,
}: InfoWindowProps) {
  const map = useAMapInstance()
  const infoRef = useRef<AMap.InfoWindow | null>(null)
  const rootRef = useRef<Root | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const positionRef = useRef<[number, number]>([longitude, latitude])
  positionRef.current = [longitude, latitude]

  useEffect(() => {
    if (!map || infoRef.current) return
    const host = document.createElement('div')
    const root = createRoot(host)
    const info = new AMap.InfoWindow({
      position: positionRef.current,
      content: host,
      isCustom: true,
      closeWhenClickMap: true,
      autoMove: false,
      offset: new AMap.Pixel(0, -12),
    })
    info.on('close' as never, () => onCloseRef.current?.())
    infoRef.current = info
    rootRef.current = root
    // 实例随地图存活，不在 effect 重跑时 close/destroy：AMap 2.0 销毁后会破坏容器状态，
    // 下一次 open 抛 removeChild 或保持 display:none
  }, [map])

  useEffect(() => {
    const info = infoRef.current
    if (!info) return
    if (visible) {
      info.open(map, [longitude, latitude])
    } else {
      info.close()
    }
  }, [map, visible, longitude, latitude])

  useLayoutEffect(() => {
    rootRef.current?.render(
      <div className="relative rounded-xl border border-separator bg-surface py-2 pl-3 pr-9 text-sm text-foreground shadow-lg">
        <button
          type="button"
          aria-label="关闭"
          onClick={() => infoRef.current?.close()}
          className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          <X className="size-3" />
        </button>
        {children}
      </div>,
    )
  })

  return null
}
