import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Spinner } from '@heroui/react'
import { useThemeStore } from '../../stores/theme'
import AMapContext, { AMapConfigContext, type AMapConfig } from './context'
import { loadAMap } from './loader'
import {
  defaultAMapTheme,
  getAMapThemeStyle,
  type AMapBaseMap,
  type AMapThemeId,
} from './styles'

const SKY_COLORS = {
  light: '#f3f4f6',
  dark: '#12161d',
} as const

const media = window.matchMedia('(prefers-color-scheme: dark)')

function useEffectiveTheme(): 'light' | 'dark' {
  const choice = useThemeStore((s) => s.theme)
  const [sysDark, setSysDark] = useState(media.matches)
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return choice === 'system' ? (sysDark ? 'dark' : 'light') : choice
}

export interface AMapRootProps {
  center?: [number, number]
  zoom?: number
  pitch?: number
  rotation?: number
  className?: string
  children?: ReactNode
}

export default function AMapRoot({
  center = [104.2, 35.9],
  zoom = 4,
  pitch = 0,
  rotation = 0,
  className,
  children,
}: AMapRootProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<AMap.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [baseMap, setBaseMap] = useState<AMapBaseMap>('standard')
  const effectiveTheme = useEffectiveTheme()
  const [themeId, setThemeIdState] = useState<AMapThemeId>(() =>
    defaultAMapTheme(effectiveTheme),
  )
  const themePickedRef = useRef(false)
  const themeIdRef = useRef(themeId)
  themeIdRef.current = themeId
  const appliedStyleRef = useRef<string | null>(null)
  const initialRef = useRef({ center, zoom, pitch, rotation })
  initialRef.current = { center, zoom, pitch, rotation }

  const setThemeId = useCallback((value: AMapThemeId) => {
    themePickedRef.current = true
    setThemeIdState(value)
  }, [])

  useEffect(() => {
    if (themePickedRef.current) return
    setThemeIdState(defaultAMapTheme(effectiveTheme))
  }, [effectiveTheme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let instance: AMap.Map | null = null
    let completeHandler: (() => void) | null = null

    void loadAMap()
      .then((AMapLib) => {
        if (disposed) return
        const init = initialRef.current
        const initialStyle = getAMapThemeStyle(themeIdRef.current)
        instance = new AMapLib.Map(container, {
          viewMode: '3D',
          center: init.center,
          zoom: init.zoom,
          pitch: init.pitch,
          rotation: init.rotation,
          zooms: [2, 20],
          mapStyle: initialStyle,
          skyColor:
            effectiveTheme === 'dark' ? SKY_COLORS.dark : SKY_COLORS.light,
          showBuildingBlock: true,
          rotateEnable: true,
          pitchEnable: true,
        })
        appliedStyleRef.current = initialStyle
        completeHandler = () => {
          if (!disposed) setReady(true)
        }
        instance.on('complete', completeHandler)
        setMap(instance)
      })
      .catch((err: unknown) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : '高德地图加载失败')
      })

    return () => {
      disposed = true
      if (instance && completeHandler) instance.off('complete', completeHandler)
      instance?.destroy()
      instance = null
      appliedStyleRef.current = null
      setMap(null)
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!map) return
    const style = getAMapThemeStyle(themeId)
    if (appliedStyleRef.current === style) return
    map.setMapStyle(style)
    appliedStyleRef.current = style
  }, [map, themeId])

  const config = useMemo<AMapConfig>(
    () => ({ baseMap, setBaseMap, themeId, setThemeId }),
    [baseMap, themeId, setThemeId],
  )

  return (
    <AMapContext.Provider value={map}>
      <AMapConfigContext.Provider value={config}>
        <div className="relative size-full">
          <div ref={containerRef} className={`size-full ${className ?? ''}`} />
          {!ready && !error ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner />
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface px-6 text-center">
              <p className="max-w-md text-sm text-muted">{error}</p>
            </div>
          ) : null}
          {map ? children : null}
        </div>
      </AMapConfigContext.Provider>
    </AMapContext.Provider>
  )
}
