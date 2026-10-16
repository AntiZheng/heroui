import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Popup as MlPopup } from 'maplibre-gl'
import { useMapInstance } from './context'

export interface PopupProps {
  latitude: number
  longitude: number
  closeButton?: boolean
  onClose?: () => void
  offset?: number
  children?: ReactNode
}

export function Popup({ latitude, longitude, closeButton = false, onClose, offset = 16, children }: PopupProps) {
  const map = useMapInstance()
  const rootRef = useRef<Root | null>(null)
  const popupRef = useRef<MlPopup | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const childrenRef = useRef(children)
  childrenRef.current = children

  useEffect(() => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const popup = new MlPopup({ closeButton, offset, className: 'map-popup-shell' })
      .setLngLat([longitude, latitude])
      .setDOMContent(host)
      .addTo(map)
    popup.on('close', () => onCloseRef.current?.())
    popupRef.current = popup
    rootRef.current = root
    root.render(
      <div className="rounded-xl border border-separator bg-surface px-3 py-2 text-sm text-foreground shadow-lg">
        {childrenRef.current}
      </div>,
    )
    return () => {
      popup.remove()
      const pendingRoot = root
      popupRef.current = null
      rootRef.current = null
      // React 19 在提交阶段禁止同步 unmount 子 root，延迟到下一轮宏任务
      setTimeout(() => pendingRoot.unmount(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, closeButton, offset])

  useEffect(() => {
    popupRef.current?.setLngLat([longitude, latitude])
  }, [longitude, latitude])

  useLayoutEffect(() => {
    rootRef.current?.render(
      <div className="rounded-xl border border-separator bg-surface px-3 py-2 text-sm text-foreground shadow-lg">
        {children}
      </div>,
    )
  })

  return null
}
