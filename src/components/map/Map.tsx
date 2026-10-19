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
  /** 底图背景层透明，露出容器下面的页面底色（主题切换后仍生效） */
  transparentBackground?: boolean
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
    // OpenMapTiles 的 name:zh 自带「简体/繁体」斜杠拼接，中文优先取 name:zh-Hans
    const expression =
      lang === 'local'
        ? base
        : lang === 'zh'
          ? ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], base]
          : ['coalesce', ['get', `name:${lang}`], base]
    m.setLayoutProperty(layer.id, 'text-field', expression as never)
  }
}

function applyBackgroundTransparency(m: MlMap, transparent: boolean) {
  for (const layer of m.getStyle().layers) {
    if (layer.type === 'background') {
      m.setPaintProperty(layer.id, 'background-opacity', transparent ? 0 : 1)
    }
  }
}

// OpenFreeMap dark 通体近黑，深色页面下陆地、边界和标注几乎糊在一起；
// 换成蓝灰分层配色：陆地实底（背景层即陆地）、海洋更深、边界与文字提亮
function applyDarkMapTone(m: MlMap) {
  const setPaint = (id: string, prop: string, value: unknown) => {
    if (m.getLayer(id)) m.setPaintProperty(id, prop as never, value as never)
  }
  setPaint('background', 'background-color', 'rgb(27, 37, 51)')
  // 背景层被 water 覆盖之外的部分就是陆地，透明后会直接露出页面底色
  setPaint('background', 'background-opacity', 1)
  setPaint('water', 'fill-color', 'rgb(13, 24, 38)')
  setPaint('waterway', 'line-color', 'rgb(40, 63, 88)')
  setPaint('landcover_ice_shelf', 'fill-color', 'rgb(46, 60, 78)')
  setPaint('landcover_glacier', 'fill-color', 'rgb(40, 54, 70)')
  setPaint('landuse_residential', 'fill-color', 'rgb(35, 46, 61)')
  setPaint('landuse_park', 'fill-color', 'rgb(31, 45, 48)')
  setPaint('landcover_wood', 'fill-color', 'rgb(30, 42, 46)')
  setPaint('boundary_state', 'line-color', 'rgba(148, 163, 184, 0.32)')
  setPaint('boundary_country_z0-4', 'line-color', 'rgba(148, 163, 184, 0.62)')
  setPaint('boundary_country_z5-', 'line-color', 'rgba(148, 163, 184, 0.62)')
  for (const layer of m.getStyle().layers) {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
    setPaint(layer.id, 'text-color', 'rgba(226, 232, 240, 0.92)')
    if (layer.paint?.['text-halo-color'] !== undefined) {
      setPaint(layer.id, 'text-halo-color', 'rgba(5, 10, 18, 0.92)')
    }
  }
}

// 全屏：彩色底图 + 球体大气光晕；星空由容器 CSS 透出，标注反白并加深色描边保证可读
function applyFullscreenGlobeTone(m: MlMap) {
  // 样式无 sky 时 MapLibre 会把各色显式置为 transparent，必须把颜色一起给全，光晕才会出现
  m.setSky({
    'sky-color': '#88C6FC',
    'sky-horizon-blend': 0.8,
    'horizon-color': '#eaf6ff',
    'horizon-fog-blend': 0.8,
    'fog-color': '#bcdcff',
    'fog-ground-blend': 0.5,
    'atmosphere-blend': 1,
  })
  if (m.getLayer('water')) {
    m.setPaintProperty('water', 'fill-color', 'rgb(158, 209, 244)' as never)
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
  transparentBackground,
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
  // style.load 会在主题切换换样式后再次触发，样式/语言/透明度都用 ref 取最新值
  const styleUrlRef = useRef(styleUrl)
  styleUrlRef.current = styleUrl
  const darkStyleUrlRef = useRef(styles.dark ?? MAP_STYLES.dark)
  darkStyleUrlRef.current = styles.dark ?? MAP_STYLES.dark
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  const languageRef = useRef(language)
  languageRef.current = language
  // 各图层原始 text-field 缓存（跟随地图实例）
  const originalsRef = useRef(new Map<string, unknown>())
  const transparentBackgroundRef = useRef(transparentBackground)
  transparentBackgroundRef.current = transparentBackground

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
    // MapLibre 6 的紧凑归因默认展开，且归因内容异步到达后还会再次展开；
    // 跟随样式/数据事件折叠，用户手动点开切换按钮后不再干预
    const attributionToggle = container.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')
    let userToggledAttribution = false
    const markAttributionToggled = () => {
      userToggledAttribution = true
    }
    const collapseAttribution = () => {
      if (userToggledAttribution) return
      const attribution = container.querySelector<HTMLElement>(
        '.maplibregl-ctrl-attrib.maplibregl-compact',
      )
      attribution?.classList.remove('maplibregl-compact-show')
      attribution?.removeAttribute('open')
    }
    attributionToggle?.addEventListener('click', markAttributionToggled)
    collapseAttribution()
    m.on('styledata', collapseAttribution)
    m.on('sourcedata', collapseAttribution)
    m.on('style.load', () => {
      m.setProjection({ type: 'globe' })
      const isFullscreen = fullscreenRef.current
      const isDark = !isFullscreen && styleUrlRef.current === darkStyleUrlRef.current
      // 全屏时页面底色不可用（浏览器铺黑），必须用实底托住陆地；暗色样式本身即实底
      applyBackgroundTransparency(
        m,
        !isFullscreen && !isDark && !!transparentBackgroundRef.current,
      )
      if (isFullscreen) applyFullscreenGlobeTone(m)
      else if (isDark) applyDarkMapTone(m)
      if (languageRef.current) applyLabelLanguage(m, languageRef.current, originalsRef.current)
    })
    m.dragRotate.disable()
    const ctrlRotate = createCtrlRotateHandler(m)
    setMap(m)
    return () => {
      m.off('styledata', collapseAttribution)
      m.off('sourcedata', collapseAttribution)
      attributionToggle?.removeEventListener('click', markAttributionToggled)
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

  // 全屏状态由地图容器自身是否处于 Fullscreen 判定；进入全屏要恢复实底并铺星空
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onChange = () => setFullscreen(document.fullscreenElement === container)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // 运行期切换透明背景/全屏；样式尚未就绪时由 style.load 里的 ref 兜底。
  // 深色与全屏样式始终实底（背景层即陆地或球面），transparentBackground 只在浅色常态样式下生效
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return
    if (appliedStyleRef.current === FULLSCREEN_MAP_STYLE) return
    if (styleUrlRef.current === darkStyleUrlRef.current) return
    applyBackgroundTransparency(map, !!transparentBackground && !fullscreen)
  }, [map, transparentBackground, fullscreen])

  // 只改全屏分支的地图样式：进入载入彩色样式，退出恢复当前主题样式
  useEffect(() => {
    const activeStyle = fullscreen ? FULLSCREEN_MAP_STYLE : styleUrl
    if (!map || appliedStyleRef.current === activeStyle) return
    appliedStyleRef.current = activeStyle
    // 不同样式的标注基准表达式不同，换样式前清空缓存
    originalsRef.current.clear()
    map.setStyle(activeStyle, { diff: false })
  }, [map, styleUrl, fullscreen])

  return (
    <MapContext.Provider value={map}>
      <div
        ref={containerRef}
        className={`size-full ${fullscreen ? 'map-starfield' : ''} ${className ?? ''}`}
      />
      {map ? children : null}
    </MapContext.Provider>
  )
}
