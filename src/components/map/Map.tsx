import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Map as MlMap, setWorkerUrl } from 'maplibre-gl'
// 显式指定 worker：maplibre v6 按 import.meta.url 推导 worker 路径，被 Vite 预打包后会 404
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(mapWorkerUrl)
import { useThemeStore } from '../../stores/theme'
import MapContext from './context'

export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
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

export interface MapRootProps {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  styles?: { light?: string; dark?: string }
  mapStyle?: string
  className?: string
  /** 标注语言（OpenMapTiles name:<lang> 字段），如 'zh'；缺翻译的要素回退原标注 */
  language?: string
  children?: ReactNode
}

// OpenMapTiles 瓦片带 name:<lang> 字段，改写标注 text-field 优先取指定语言，取不到回退原值
function applyLabelLanguage(m: MlMap, lang: string) {
  for (const layer of m.getStyle().layers) {
    if (layer.type !== 'symbol') continue
    const tf = layer.layout?.['text-field']
    if (!tf) continue
    const expr: unknown = typeof tf === 'string' && tf.startsWith('{') ? ['get', tf.slice(1, -1)] : tf
    if (!JSON.stringify(expr).includes('name')) continue
    m.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', `name:${lang}`],
      expr,
    ] as never)
  }
}

export default function MapRoot({
  center = [0, 0],
  zoom = 2,
  pitch = 0,
  bearing = 0,
  styles = MAP_STYLES,
  mapStyle,
  className,
  language,
  children,
}: MapRootProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MlMap | null>(null)
  const theme = useEffectiveTheme()
  const styleUrl = mapStyle ?? (theme === 'dark' ? styles.dark : styles.light) ?? MAP_STYLES.light

  const initialRef = useRef({ styleUrl, center, zoom, pitch, bearing })
  initialRef.current = { styleUrl, center, zoom, pitch, bearing }
  const appliedStyleRef = useRef(initialRef.current.styleUrl)
  // style.load 会在主题切换换样式后再次触发，语言用 ref 取最新值
  const languageRef = useRef(language)
  languageRef.current = language

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const init = initialRef.current
    const m = new MlMap({
      container,
      style: init.styleUrl,
      center: init.center,
      zoom: init.zoom,
      pitch: init.pitch,
      bearing: init.bearing,
      attributionControl: { compact: true },
    })
    m.on('style.load', () => {
      m.setProjection({ type: 'globe' })
      if (languageRef.current) applyLabelLanguage(m, languageRef.current)
    })
    setMap(m)
    return () => {
      m.remove()
      setMap(null)
    }
  }, [])

  useEffect(() => {
    if (!map || appliedStyleRef.current === styleUrl) return
    appliedStyleRef.current = styleUrl
    map.setStyle(styleUrl, { diff: false })
  }, [map, styleUrl])

  return (
    <MapContext.Provider value={map}>
      <div ref={containerRef} className={`size-full ${className ?? ''}`} />
      {map ? children : null}
    </MapContext.Provider>
  )
}
