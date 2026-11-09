// 高德轨迹渲染图层：Polyline（方向箭头/速度渐变分段）+ 起终点/公里/光标标记 + 点击就近匹配
// 轨迹数据为 WGS-84，渲染前统一转 GCJ-02（高德坐标系），点击坐标直接与 GCJ-02 缓存比对
import { useEffect, useMemo, useRef } from 'react'
import { useAMapInstance } from '../amap/context'
import { boundsOf, haversineMeters, wgs84ToGcj02 } from '../../lib/geo'
import { hasSpeedData, kmBadgeEl, kmMarks, kmStepForZoom, maxSpeedOf, pinEl, smoothSpeedAt, speedColor } from './speedColors'
import type { TrackPoint } from '../../types/track'

export interface TrackAmapLayerProps {
  points: TrackPoint[]
  color?: string
  /** 选中点（信息窗体锚定）下标 */
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

// 就近匹配的最大距离（米）：GCJ-02 与点击坐标同系，直接球面距离比对
const PICK_RADIUS_M = 60

export function TrackAmapLayer({
  points,
  color = '#3b82f6',
  activeIndex = null,
  hoverIndex = null,
  onPointClick,
  onMapClick,
  fit = false,
  speedRange = null,
}: TrackAmapLayerProps) {
  const map = useAMapInstance()
  const fittedRef = useRef(false)
  const kmAllRef = useRef<{ km: number; marker: AMap.Marker; added: boolean }[]>([])
  // 速度渐变分段及其段尾平滑速度（speedRange 变化时仅调透明度，不重建覆盖物）
  const segsRef = useRef<{ line: AMap.Polyline; speed: number }[]>([])
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  // WGS-84 → GCJ-02，一次性缓存
  const gcjPath = useMemo(
    () => points.map((p) => wgs84ToGcj02(p.lng, p.lat)),
    [points],
  )

  // 轨迹线 + 起终点标记 + 公里标注
  useEffect(() => {
    if (gcjPath.length === 0) return
    // 公里徽标按当前缩放级别抽稀/补密（zoomend 触发；缩小到 10/5/2km 步长，放大恢复逐公里）
    const applyKmFilter = () => {
      const step = kmStepForZoom(map.getZoom())
      for (const it of kmAllRef.current) {
        const should = it.km % step === 0
        if (should && !it.added) {
          map.add(it.marker)
          it.added = true
        } else if (!should && it.added) {
          map.remove(it.marker)
          it.added = false
        }
      }
    }
    map.on('zoomend', applyKmFilter)
    const lines: AMap.Polyline[] = []
    segsRef.current = []
    if (hasSpeedData(points)) {
      // 速度渐变：JSAPI Polyline 不支持沿线渐变，拆成 ≤160 段分别着色（段尾点 ±4 点平滑速度），不画方向箭头
      const max = maxSpeedOf(points)
      const chunk = Math.max(1, Math.ceil((gcjPath.length - 1) / 160))
      for (let i = 0; i < gcjPath.length - 1; i += chunk) {
        const end = Math.min(i + chunk, gcjPath.length - 1)
        const segSpeed = smoothSpeedAt(points, end)
        const line = new AMap.Polyline({
          path: gcjPath.slice(i, end + 1).map(([lng, lat]) => new AMap.LngLat(lng, lat)),
          strokeColor: speedColor(segSpeed, max),
          strokeWeight: 5,
          strokeOpacity: 0.92,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: 60,
          bubble: true,
        })
        lines.push(line)
        segsRef.current.push({ line, speed: segSpeed })
      }
    } else {
      lines.push(
        new AMap.Polyline({
          path: gcjPath.map(([lng, lat]) => new AMap.LngLat(lng, lat)),
          showDir: true,
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: 0.92,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: 60,
          bubble: true,
        }),
      )
    }
    map.add(lines)
    const mkPin = (position: [number, number], fillColor: string) =>
      new AMap.Marker({
        position: new AMap.LngLat(position[0], position[1]),
        content: pinEl(fillColor),
        anchor: 'bottom-center',
        zIndex: 120,
      })
    const startMark = mkPin(gcjPath[0], '#22c55e')
    const endMark = mkPin(gcjPath[gcjPath.length - 1], '#ef4444')
    // 公里徽标（1、2、3…依次标注在轨迹对应里程处），先创建不入图，按缩放级别决定显隐
    kmAllRef.current.forEach((it) => map.remove(it.marker))
    kmAllRef.current = kmMarks(points).map((m) => ({
      km: m.km,
      marker: new AMap.Marker({
        position: new AMap.LngLat(...wgs84ToGcj02(m.lng, m.lat)),
        content: kmBadgeEl(m.km, color),
        anchor: 'center',
        zIndex: 110,
        bubble: true,
      }),
      added: false,
    }))
    applyKmFilter()
    map.add([startMark, endMark])
    // 自动缩放到轨迹范围（GCJ-02 边界），仅首次挂载执行
    if (fit && !fittedRef.current) {
      fittedRef.current = true
      const bounds = boundsOf(gcjPath)
      if (bounds) {
        map.setBounds(
          new AMap.Bounds(
            new AMap.LngLat(bounds[0][0], bounds[0][1]),
            new AMap.LngLat(bounds[1][0], bounds[1][1]),
          ),
          false,
        )
      }
    }
    return () => {
      // AMap v2 偶发在覆盖物移除时序竞态中抛错（跨域脚本内部，间歇性），
      // 防御性捕获避免 React 整树卸载白屏；异常仍输出到控制台便于排查
      try {
        map.off('zoomend', applyKmFilter)
        map.remove(lines)
        map.remove(kmAllRef.current.map((it) => it.marker))
        kmAllRef.current = []
        map.remove([startMark, endMark])
      } catch (e) {
        console.error('[TrackAmapLayer] cleanup 失败（AMap 覆盖物移除竞态）', e)
      }
    }
  }, [map, gcjPath, color, points])

  // 速度筛选：范围外分段透明（speedRange 为 null 显示全部）
  useEffect(() => {
    for (const seg of segsRef.current) {
      const visible = !speedRange || (seg.speed >= speedRange[0] && seg.speed <= speedRange[1])
      seg.line.setOptions({ strokeOpacity: visible ? 0.92 : 0 })
    }
  }, [speedRange, points])

  // 光标点（active / hover 联动）
  useEffect(() => {
    const idx = activeIndex ?? hoverIndex ?? null
    const position = idx != null ? gcjPath[idx] : null
    if (!position) return
    const cursor = new AMap.CircleMarker({
      center: new AMap.LngLat(position[0], position[1]),
      radius: 7,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
      bubble: true,
      zIndex: 130,
    })
    map.add(cursor)
    return () => {
      try {
        map.remove(cursor)
      } catch (e) {
        console.error('[TrackAmapLayer] cursor cleanup 失败', e)
      }
    }
  }, [map, gcjPath, activeIndex, hoverIndex, color])

  // 地图点击：就近匹配轨迹点，未命中视为空白处点击
  useEffect(() => {
    const onClick = (e: unknown) => {
      const lnglat = (e as { lnglat?: { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number } }).lnglat
      if (!lnglat) return
      const clickLng = typeof lnglat.lng === 'number' ? lnglat.lng : lnglat.getLng?.()
      const clickLat = typeof lnglat.lat === 'number' ? lnglat.lat : lnglat.getLat?.()
      if (clickLng == null || clickLat == null) return
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < gcjPath.length; i++) {
        const d = haversineMeters([clickLng, clickLat], gcjPath[i])
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      if (bestIdx >= 0 && bestDist <= PICK_RADIUS_M) {
        onPointClickRef.current?.(bestIdx)
      } else {
        onMapClickRef.current?.()
      }
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, gcjPath])

  return null
}
