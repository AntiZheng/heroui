// MapLibre 轨迹渲染图层：GeoJSON source + line/invisible-points/cursor layer + 起终点/公里标记
// 坐标为 WGS-84，MapLibre 底图直接使用；主题切换/全屏 setStyle 后在 style.load 重建
// 有速度数据时轨迹线按速度渐变着色（绿→黄→红），无速度数据回退主题色
import { useEffect, useRef } from 'react'
import { Marker as MlMarker } from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { useMapInstance } from '../map/context'
import { boundsOf } from '../../lib/geo'
import { hasSpeedData, kmBadgeEl, kmMarks, kmStepForZoom, maxSpeedOf, pinEl, smoothSpeedAt, speedColor } from './speedColors'
import type { TrackPoint } from '../../types/track'

export interface TrackMlLayerProps {
  points: TrackPoint[]
  color?: string
  /** 选中点（弹窗锚定）下标 */
  activeIndex?: number | null
  /** 图表 hover 联动下标 */
  hoverIndex?: number | null
  onPointClick?: (index: number) => void
  /** 点击地图空白处（清除选中） */
  onMapClick?: () => void
  /** 挂载后自动缩放到轨迹范围（底图切换/进入详情时） */
  fit?: boolean
  /** 速度筛选上下限（km/h），范围外线段透明；null 显示全区间 */
  speedRange?: [number, number] | null
}

const SOURCE = 'track-src'
const LINE_LAYER = 'track-line'
const VERTS_LAYER = 'track-verts'
const CURSOR_LAYER = 'track-cursor'
const CURSOR_SRC = 'track-cursor-src'

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry>

function lineGeoJSON(points: TrackPoint[]): FC {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [p.lng, p.lat]),
        },
      },
      // 顶点要素（不可见 circle layer 供点击拾取）
      ...points.map((p, i) => ({
        type: 'Feature' as const,
        properties: { i },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
      })),
    ],
  }
}

// 速度渐变 paint 表达式：line-progress 是按线段长度的里程比例（lineMetrics），色标必须按累计里程定位
// （顶点下标比例在停留/慢速段点密集时会错位）。每个采样色标按其局部速度（±4 点平滑）判定：
// 在筛选区间内 → 速度色；范围外 → 透明。maplibre v6 需赋给独立的 line-gradient paint 属性
// （赋给 line-color 会静默失效恒为首个色标），且 source 必须开 lineMetrics，否则 addLayer 直接报错。
function speedGradientExpr(points: TrackPoint[], range: [number, number] | null): ExpressionSpecification {
  const max = Math.max(maxSpeedOf(points), 1)
  const n = points.length
  const total = points[n - 1].dist_m ?? 0
  // 采样 ≤800 个色标：太密表达式膨胀，太疏会漏掉短促的速度峰谷
  const step = Math.max(1, Math.ceil((n - 1) / 800))
  const lo = range?.[0] ?? null
  const hi = range?.[1] ?? null
  const HIDE = 'rgba(0,0,0,0)'
  const inRange = (sp: number) => lo == null || hi == null || (sp >= lo && sp <= hi)
  const colorOf = (i: number) => {
    const sp = smoothSpeedAt(points, i)
    return inRange(sp) ? speedColor(sp, max) : HIDE
  }
  const stops: [number, string][] = []
  for (let i = 0; i < n - 1; i += step) {
    stops.push([total > 0 ? (points[i].dist_m ?? 0) / total : i / (n - 1), colorOf(i)])
  }
  stops.push([1, colorOf(n - 1)])
  // 色标里程比例必须严格递增；停留点密集处比例重复，若后采样为透明则覆盖（宁可漏显不漏筛）
  const flat: unknown[] = []
  let lastFrac = -1
  for (const [f, c] of stops) {
    if (f <= lastFrac + 1e-9) {
      if (c === HIDE && flat.length >= 2) flat[flat.length - 1] = c
      continue
    }
    flat.push(f, c)
    lastFrac = f
  }
  if (flat.length < 4) return HIDE as unknown as ExpressionSpecification
  return ['interpolate', ['linear'], ['line-progress'], ...flat] as unknown as ExpressionSpecification
}

function pointGeoJSON(point: TrackPoint | null): FC {
  return {
    type: 'FeatureCollection',
    features:
      point != null
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
            },
          ]
        : [],
  }
}

export function TrackMlLayer({
  points,
  color = '#3b82f6',
  activeIndex = null,
  hoverIndex = null,
  onPointClick,
  onMapClick,
  fit = false,
  speedRange = null,
}: TrackMlLayerProps) {
  const map = useMapInstance()
  const startRef = useRef<MlMarker | null>(null)
  const endRef = useRef<MlMarker | null>(null)
  const kmAllRef = useRef<{ km: number; marker: MlMarker; added: boolean }[]>([])
  const fittedRef = useRef(false)
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  // 挂载/重建：source 数据 + 图层 + 起终点标记
  useEffect(() => {
    // 公里徽标按当前缩放级别抽稀/补密（zoomend 触发；缩小到 10/5/2km 步长，放大恢复逐公里）
    const applyKmFilter = () => {
      const step = kmStepForZoom(map.getZoom())
      for (const it of kmAllRef.current) {
        const should = it.km % step === 0
        if (should && !it.added) {
          it.marker.addTo(map)
          it.added = true
        } else if (!should && it.added) {
          it.marker.remove()
          it.added = false
        }
      }
    }
    const setup = () => {
      const src = map.getSource(SOURCE)
      if (src && 'setData' in src) {
        ;(src as GeoJSONSource).setData(lineGeoJSON(points))
      } else {
        // line-gradient 必须搭配 source 的 lineMetrics（v6 类型定义未列出但运行时强校验）
        map.addSource(SOURCE, { type: 'geojson', data: lineGeoJSON(points), lineMetrics: true })
        map.addSource(CURSOR_SRC, { type: 'geojson', data: pointGeoJSON(null) })
      }
      // 轨迹线 paint：有速度数据 → 速度渐变（v6 必须用 line-gradient 属性）；无 → 主题色
      const gradient = hasSpeedData(points) ? speedGradientExpr(points, speedRange) : null
      if (!map.getLayer(LINE_LAYER)) {
        map.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'i'], null],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': color,
            ...(gradient ? { 'line-gradient': gradient } : {}),
            'line-width': 4,
            'line-opacity': 0.92,
          },
        })
        map.addLayer({
          id: VERTS_LAYER,
          type: 'circle',
          source: SOURCE,
          filter: ['!=', ['get', 'i'], null],
          paint: { 'circle-radius': 7, 'circle-opacity': 0, 'circle-stroke-opacity': 0 },
        })
        map.addLayer({
          id: CURSOR_LAYER,
          type: 'circle',
          source: CURSOR_SRC,
          paint: {
            'circle-radius': 6,
            'circle-color': color,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        })
      } else {
        map.setPaintProperty(LINE_LAYER, 'line-color', color)
        // 有无速度数据切换时更新/清除渐变
        map.setPaintProperty(LINE_LAYER, 'line-gradient', (gradient ?? null) as never)
      }
      // 起终点标记 + 公里标注（步长随缩放级别自适应，zoomend 时抽稀/补密）
      kmAllRef.current.forEach((it) => it.marker.remove())
      kmAllRef.current = []
      if (points.length > 0) {
        startRef.current?.remove()
        endRef.current?.remove()
        startRef.current = new MlMarker({ element: pinEl('#22c55e'), anchor: 'bottom' })
          .setLngLat([points[0].lng, points[0].lat])
          .addTo(map)
        endRef.current = new MlMarker({ element: pinEl('#ef4444'), anchor: 'bottom' })
          .setLngLat([points[points.length - 1].lng, points[points.length - 1].lat])
          .addTo(map)
        // 先创建全部公里徽标（不入图），再按当前缩放级别决定显隐
        kmAllRef.current = kmMarks(points).map((m) => ({
          km: m.km,
          marker: new MlMarker({ element: kmBadgeEl(m.km, color) }).setLngLat([m.lng, m.lat]),
          added: false,
        }))
        applyKmFilter()
        // 自动缩放到轨迹范围（仅首次）
        if (fit && !fittedRef.current) {
          fittedRef.current = true
          const bounds = boundsOf(points.map((p) => [p.lng, p.lat]))
          if (bounds) {
            map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 0 })
          }
        }
      }
    }
    if (map.isStyleLoaded()) setup()
    map.on('style.load', setup)
    map.on('zoomend', applyKmFilter)
    return () => {
      map.off('style.load', setup)
      map.off('zoomend', applyKmFilter)
      startRef.current?.remove()
      endRef.current?.remove()
      startRef.current = null
      endRef.current = null
      kmAllRef.current.forEach((it) => it.marker.remove())
      kmAllRef.current = []
      // 组件卸载（底图切换）时移除图层与 source；setStyle 后图层已不存在
      if (map.getLayer(LINE_LAYER)) {
        for (const id of [CURSOR_LAYER, VERTS_LAYER, LINE_LAYER]) map.removeLayer(id)
        for (const id of [CURSOR_SRC, SOURCE]) map.removeSource(id)
      }
    }
  }, [map, points, color, speedRange])

  // 点击事件：顶点拾取 + 空白处清除
  useEffect(() => {
    const onVertClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      const i = f?.properties?.i
      if (typeof i === 'number') onPointClickRef.current?.(i)
    }
    const onBlankClick = () => onMapClickRef.current?.()
    const onVertEnter = () => (map.getCanvas().style.cursor = 'pointer')
    const onVertLeave = () => (map.getCanvas().style.cursor = '')
    map.on('click', VERTS_LAYER, onVertClick)
    map.on('click', onBlankClick)
    map.on('mouseenter', VERTS_LAYER, onVertEnter)
    map.on('mouseleave', VERTS_LAYER, onVertLeave)
    return () => {
      map.off('click', VERTS_LAYER, onVertClick)
      map.off('click', onBlankClick)
      map.off('mouseenter', VERTS_LAYER, onVertEnter)
      map.off('mouseleave', VERTS_LAYER, onVertLeave)
    }
  }, [map])

  // 光标点（active / hover）联动
  useEffect(() => {
    const apply = () => {
      const idx = activeIndex ?? hoverIndex ?? null
      const point = idx != null ? points[idx] ?? null : null
      const src = map.getSource(CURSOR_SRC)
      if (src && 'setData' in src) (src as GeoJSONSource).setData(pointGeoJSON(point))
    }
    if (map.isStyleLoaded()) apply()
    map.on('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }, [map, points, activeIndex, hoverIndex])

  return null
}
