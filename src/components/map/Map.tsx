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

// 全屏展示专用彩色底图：Liberty 自带分色地物与浅色海洋，配合大气层接近参考图的彩色地球
const FULLSCREEN_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

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
  /** 全屏时保持当前底图不切换（默认全屏会切换到专用彩色底图 + 星空氛围） */
  keepStyleInFullscreen?: boolean
  children?: ReactNode
}

// OpenMapTiles 瓦片带 name:<lang> 字段，改写标注 text-field 优先取指定语言，取不到回退原值。
// originals 缓存各图层原始 text-field，便于切换回"本地名称"或重复应用时拿到干净的基准表达式
function applyLabelLanguage(m: MlMap, lang: string, originals: Map<string, unknown>) {
  for (const layer of m.getStyle().layers) {
    if (layer.type !== 'symbol') continue
    const tf = layer.layout?.['text-field']
    if (!tf) continue
    let base = originals.get(layer.id)
    if (base === undefined) {
      base = typeof tf === 'string' && tf.startsWith('{') ? ['get', tf.slice(1, -1)] : tf
      if (!JSON.stringify(base).includes('name')) continue
      originals.set(layer.id, base)
    }
    m.setLayoutProperty(
      layer.id,
      'text-field',
      lang === 'local' ? (base as never) : (['coalesce', ['get', `name:${lang}`], base] as never),
    )
  }
}

// 全屏：彩色底图 + 球体轮廓外发光；星空由容器 CSS 透出，标注反白并加深色描边保证可读。
// 物理大气层（setSky）会把光晕铺在球面上无法只留外圈，因此 atmosphere-blend 压到 0.15
// 仅保留一点边缘大气感，外圈光晕由 .map-starfield .maplibregl-canvas 的 drop-shadow 实现。
// 太阳固定在相机正后方（viewport 锚定），让残留的大气感整圈均匀。
function applyFullscreenGlobeTone(m: MlMap) {
  m.setSky({
    'sky-color': '#0a1628',
    'sky-horizon-blend': 0.5,
    'horizon-color': '#a8d5ff',
    'horizon-fog-blend': 0.8,
    'fog-color': '#bcdcff',
    'fog-ground-blend': 0,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.15, 5, 0.15, 7, 0],
  })
  m.setLight({ anchor: 'viewport', position: [1.15, 0, 180] })
  if (m.getLayer('water')) {
    m.setPaintProperty('water', 'fill-color', 'rgb(120, 180, 230)' as never)
  }
  for (const layer of m.getStyle().layers) {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
    m.setPaintProperty(layer.id, 'text-color', 'rgba(255, 255, 255, 0.96)' as never)
    m.setPaintProperty(layer.id, 'text-halo-color', 'rgba(6, 16, 32, 0.85)' as never)
  }
}

// 仅保留 Ctrl + 左键拖动旋转/倾斜：禁用 maplibre 默认旋转（右键拖动 / Ctrl 左键），
// 在容器捕获阶段拦截 Ctrl+左键按下（阻止 DragPan 接管），自行驱动 bearing/pitch，左键平移不受影响
function createCtrlRotateHandler(m: MlMap) {
  const container = m.getContainer()
  let lastX = 0
  let lastY = 0
  let stop: (() => void) | null = null

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !e.ctrlKey) return
    e.stopPropagation()
    e.preventDefault()
    lastX = e.clientX
    lastY = e.clientY
    const maxPitch = m.getMaxPitch()
    const onMove = (ev: MouseEvent) => {
      m.setBearing(m.getBearing() + (ev.clientX - lastX) * 0.3)
      m.setPitch(Math.min(maxPitch, Math.max(0, m.getPitch() - (ev.clientY - lastY) * 0.2)))
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      stop = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    stop = onUp
  }

  container.addEventListener('mousedown', onMouseDown, true)
  return {
    destroy() {
      container.removeEventListener('mousedown', onMouseDown, true)
      stop?.()
    },
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
  keepStyleInFullscreen = false,
  children,
}: MapRootProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MlMap | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const theme = useEffectiveTheme()
  const styleUrl = mapStyle ?? (theme === 'dark' ? styles.dark : styles.light) ?? MAP_STYLES.light

  const initialRef = useRef({ styleUrl, center, zoom, pitch, bearing })
  initialRef.current = { styleUrl, center, zoom, pitch, bearing }
  const appliedStyleRef = useRef(initialRef.current.styleUrl)
  // style.load 会在主题切换换样式后再次触发，全屏/语言用 ref 取最新值
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  const languageRef = useRef(language)
  languageRef.current = language
  const keepStyleRef = useRef(keepStyleInFullscreen)
  keepStyleRef.current = keepStyleInFullscreen
  // 各图层原始 text-field 缓存（跟随地图实例）
  const originalsRef = useRef(new Map<string, unknown>())

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
      if (fullscreenRef.current && !keepStyleRef.current) applyFullscreenGlobeTone(m)
      if (languageRef.current) applyLabelLanguage(m, languageRef.current, originalsRef.current)
    })
    m.dragRotate.disable()
    const ctrlRotate = createCtrlRotateHandler(m)
    setMap(m)
    return () => {
      ctrlRotate.destroy()
      m.remove()
      setMap(null)
    }
  }, [])

  // 语言运行时切换：样式已就绪立即应用，否则等下一次 style.load
  useEffect(() => {
    if (!map || !language) return
    if (map.isStyleLoaded()) {
      applyLabelLanguage(map, language, originalsRef.current)
      return
    }
    const apply = () => applyLabelLanguage(map, language, originalsRef.current)
    map.once('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }, [map, language])

  // 全屏状态由地图容器（或其带 data-fullscreen-root 标记的祖先）是否处于 Fullscreen 判定
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onChange = () => {
      const root =
        (container.closest('[data-fullscreen-root]') as HTMLElement | null) ?? container
      setFullscreen(document.fullscreenElement === root)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // 进入全屏切换彩色底图 + 大气层，退出恢复当前主题样式（keepStyleInFullscreen 时不切换）
  useEffect(() => {
    if (keepStyleInFullscreen) return
    const activeStyle = fullscreen ? FULLSCREEN_MAP_STYLE : styleUrl
    if (!map || appliedStyleRef.current === activeStyle) return
    appliedStyleRef.current = activeStyle
    originalsRef.current.clear()
    map.setStyle(activeStyle, { diff: false })
  }, [map, styleUrl, fullscreen, keepStyleInFullscreen])

  return (
    <MapContext.Provider value={map}>
      <div
        ref={containerRef}
        className={`size-full ${fullscreen && !keepStyleInFullscreen ? 'map-starfield' : ''} ${className ?? ''}`}
      />
      {map ? children : null}
    </MapContext.Provider>
  )
}
