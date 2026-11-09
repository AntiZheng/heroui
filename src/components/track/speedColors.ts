// 速度配色与公里标注工具（MapLibre / 高德两层共用）
// 语义色：慢=绿、中=黄、快=红（0 → maxSpeed 三段线性渐变）
import type { TrackPoint } from '../../types/track'

const STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [34, 197, 94] }, // #22c55e
  { at: 0.5, rgb: [234, 179, 8] }, // #eab308
  { at: 1, rgb: [239, 68, 68] }, // #ef4444
]

export function hasSpeedData(points: TrackPoint[]): boolean {
  return points.some((p) => p.speed_kmh != null)
}

// 速度色标上限：取 95 分位速度 ×1.15（免疫 GPS 毛刺超速点拉爆色标），
// 下限 8km/h，避免低速轨迹整条全红
export function maxSpeedOf(points: TrackPoint[]): number {
  return colorScaleMax(points.map((p) => p.speed_kmh))
}

// 色标上限（数值序列版）：图表曲线与地图轨迹共用同一取色口径
export function colorScaleMax(speeds: (number | null | undefined)[]): number {
  const sorted = speeds
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return 8
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return Math.max(p95 * 1.15, 8)
}

// 位置 i 的平滑速度：±halfWin 点滑动平均（抑制逐点速度抖动，上色更连续）
export function smoothSpeedAt(points: TrackPoint[], i: number, halfWin = 4): number {
  let sum = 0
  let n = 0
  const lo = Math.max(0, i - halfWin)
  const hi = Math.min(points.length - 1, i + halfWin)
  for (let j = lo; j <= hi; j++) {
    const v = points[j].speed_kmh
    if (v != null && Number.isFinite(v)) {
      sum += v
      n++
    }
  }
  return n > 0 ? sum / n : 0
}

export function speedColor(speed: number | null | undefined, max: number): string {
  const t = Math.min(Math.max((speed ?? 0) / max, 0), 1)
  const hi = STOPS.findIndex((s) => t <= s.at)
  const a = STOPS[Math.max(hi - 1, 0)]
  const b = STOPS[hi === -1 ? STOPS.length - 1 : Math.max(hi, 1)]
  const span = b.at - a.at || 1
  const k = Math.min(Math.max((t - a.at) / span, 0), 1)
  const rgb = a.rgb.map((c, i) => Math.round(c + (b.rgb[i] - c) * k))
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

export interface KmMark {
  km: number
  lng: number
  lat: number
}

// 公里标注步长随缩放级别自适应：放大显示更密、缩小自动抽稀，避免低缩放级别下徽标相互压盖
export function kmStepForZoom(zoom: number): number {
  if (zoom >= 14) return 1
  if (zoom >= 12) return 2
  if (zoom >= 10) return 5
  return 10
}

// 公里标注点：dist_m 首次跨过 k*1000 的轨迹点位置
export function kmMarks(points: TrackPoint[]): KmMark[] {
  const marks: KmMark[] = []
  if (points.length === 0) return marks
  const total = points[points.length - 1].dist_m ?? 0
  const count = Math.floor(total / 1000)
  if (count === 0) return marks
  let i = 0
  for (let k = 1; k <= count; k++) {
    while (i < points.length && (points[i].dist_m ?? 0) < k * 1000) i++
    if (i >= points.length) break
    marks.push({ km: k, lng: points[i].lng, lat: points[i].lat })
  }
  return marks
}

// 公里徽标 DOM（两层样式一致：白底圆角 + 深色描边 + 加粗深色数字，保证在各种底图上清晰可读）
export function kmBadgeEl(km: number, _accent: string): HTMLDivElement {
  const el = document.createElement('div')
  // 图示参考样式（高德/Google 里程碑风）：深色半透明圆底 + 白色粗体数字，无描边，任意底图上都醒目
  el.style.cssText =
    'min-width:20px;height:20px;padding:0 2px;border-radius:10px;background:rgba(17,24,39,.82);' +
    'color:#ffffff;font:700 11px/20px system-ui,-apple-system,sans-serif;' +
    'text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.35);box-sizing:border-box;'
  el.textContent = String(km)
  return el
}

// 起终点图钉 DOM（泪滴形大头针 + 白色内点，anchor 由调用方设为底部尖端）
export function pinEl(color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));cursor:pointer;'
  el.innerHTML =
    `<svg width="18" height="24" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M12 1C6.2 1 1.5 5.6 1.5 11.4 1.5 19.8 12 30.5 12 30.5S22.5 19.8 22.5 11.4C22.5 5.6 17.8 1 12 1z" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
    `<circle cx="12" cy="11.4" r="4.2" fill="#fff"/>` +
    `</svg>`
  return el
}
