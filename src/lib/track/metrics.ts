// 轨迹指标计算：摘要指标 + 每公里分段 + 停靠检测 + 时序数组
import type { TrackAnalysis, TrackDims, TrackPoint } from '../../types/track'

// 停靠判定阈值：速度低于 1 km/h 持续 ≥30s 视为停靠
const STOP_SPEED_KMH = 1
const STOP_MIN_S = 30
// 海拔增益平滑阈值：单点变化小于该值不累计（抑制 GPS 高程抖动）
const ELE_SMOOTH_M = 5
// 速度滑动平均窗口（点数）
const SPEED_SMOOTH_WINDOW = 5

function smoothSpeeds(speeds: (number | undefined)[]): (number | undefined)[] {
  return speeds.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - SPEED_SMOOTH_WINDOW + 1); j <= i; j++) {
      const v = speeds[j]
      if (v != null && Number.isFinite(v)) {
        sum += v
        n++
      }
    }
    return n > 0 ? sum / n : undefined
  })
}

// 累计爬升/下降：带迟滞的平滑（超过阈值才计入，并重置基准）
function eleGainLoss(eles: number[]): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  if (eles.length === 0) return { ascent, descent }
  let base = eles[0]
  for (const ele of eles) {
    const delta = ele - base
    if (delta >= ELE_SMOOTH_M) {
      ascent += delta
      base = ele
    } else if (delta <= -ELE_SMOOTH_M) {
      descent += -delta
      base = ele
    }
  }
  return { ascent, descent }
}

// 停靠段检测：连续速度低于阈值且时长达标
function detectStops(points: TrackPoint[]): { stops: TrackAnalysis['stops']; stoppedS: number } {
  const stops: TrackAnalysis['stops'] = []
  let stoppedS = 0
  let startIdx = -1
  const flush = (endIdx: number) => {
    if (startIdx < 0) return
    const a = points[startIdx]
    const b = points[endIdx]
    if (a.time != null && b.time != null) {
      const durationS = (b.time - a.time) / 1000
      if (durationS >= STOP_MIN_S) {
        stops.push({
          start_index: startIdx,
          end_index: endIdx,
          start_dist_m: a.dist_m ?? 0,
          end_dist_m: b.dist_m ?? 0,
          duration_s: Math.round(durationS),
        })
        stoppedS += durationS
      }
    }
    startIdx = -1
  }
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    if (prev.time == null || cur.time == null) continue
    const stopped = (cur.speed_kmh ?? 0) < STOP_SPEED_KMH
    if (stopped) {
      if (startIdx < 0) startIdx = i - 1
    } else {
      flush(i - 1)
    }
  }
  flush(points.length - 1)
  return { stops, stoppedS }
}

// 每公里分段：里程每满 1km 截一段，末尾不足 1km 的部分并入最后一段
function computeSplits(points: TrackPoint[], hasTime: boolean, hasEle: boolean): TrackAnalysis['splits'] {
  const splits: TrackAnalysis['splits'] = []
  if (points.length < 2 || !hasTime) return splits
  let kmStart = 0
  let km = 0
  for (let i = 1; i < points.length; i++) {
    const dist = points[i].dist_m ?? 0
    if (dist >= (km + 1) * 1000) {
      km++
      const endDist = km * 1000
      splits.push(makeSplit(km, points, kmStart, i, endDist, hasTime, hasEle))
      kmStart = i
    }
  }
  const last = points[points.length - 1]
  const totalDist = last.dist_m ?? 0
  const covered = splits.length * 1000
  // 末尾剩余 >=200m 才单独成段
  if (totalDist - covered >= 200) {
    splits.push(makeSplit(splits.length + 1, points, kmStart, points.length - 1, totalDist, hasTime, hasEle))
  }
  return splits
}

function makeSplit(
  km: number,
  points: TrackPoint[],
  startIdx: number,
  endIdx: number,
  endDistM: number,
  hasTime: boolean,
  hasEle: boolean,
): TrackAnalysis['splits'][number] {
  const a = points[startIdx]
  const b = points[endIdx]
  const durationS =
    hasTime && a.time != null && b.time != null ? (b.time - a.time) / 1000 : 0
  const segDist = endDistM - (a.dist_m ?? 0)
  // 与总指标 eleGainLoss 同口径（5m 迟滞平滑），抑制 GPS 高程抖动导致的爬升高估
  let ascent = 0
  if (hasEle) {
    const segEles: number[] = []
    for (let i = startIdx; i <= endIdx; i++) {
      const e = points[i].ele
      if (e != null && Number.isFinite(e)) segEles.push(e)
    }
    ascent = eleGainLoss(segEles).ascent
  }
  return {
    index: km,
    start_dist_m: Math.round(a.dist_m ?? 0),
    end_dist_m: Math.round(endDistM),
    duration_s: Math.round(durationS),
    avg_speed_kmh: durationS > 0 ? (segDist / durationS) * 3.6 : 0,
    pace_s_per_km: durationS > 0 && segDist > 0 ? Math.round(durationS / (segDist / 1000)) : null,
    ascent_m: Math.round(ascent),
    ...(a.time != null ? { start_time: a.time } : {}),
    ...(b.time != null ? { end_time: b.time } : {}),
  }
}

// 指标分析主入口
export function analyzeTrack(points: TrackPoint[], dims: TrackDims): TrackAnalysis {
  const n = points.length
  const eles = points.map((p) => p.ele).filter((v): v is number => v != null)
  const rawSpeeds = points.map((p) => p.speed_kmh)
  const speeds = smoothSpeeds(rawSpeeds).map((v) => v ?? undefined)
  // 回写平滑速度供图表/逐点信息使用
  speeds.forEach((v, i) => {
    if (v != null) points[i].speed_kmh = v
  })

  const distanceM = n > 0 ? points[n - 1].dist_m ?? 0 : 0
  const first = points[0]
  const last = points[n - 1]
  const durationS =
    first?.time != null && last?.time != null ? Math.max(0, (last.time - first.time) / 1000) : 0

  const { stops, stoppedS } = dims.time ? detectStops(points) : { stops: [], stoppedS: 0 }
  const movingS = Math.max(0, durationS - stoppedS)
  const maxSpeed = speeds.reduce<number>((m, v) => (v != null && v > m ? v : m), 0)
  const avgSpeed = movingS > 0 ? (distanceM / movingS) * 3.6 : 0
  const { ascent, descent } = eleGainLoss(eles)

  const times = dims.time ? points.map((p) => p.time ?? null) : null
  const cumTimes = dims.time
    ? points.map((p) => (first?.time != null && p.time != null ? (p.time - first.time) / 1000 : null))
    : null

  return {
    distance_m: distanceM,
    ascent_m: Math.round(ascent),
    descent_m: Math.round(descent),
    max_ele_m: eles.length > 0 ? Math.max(...eles) : null,
    min_ele_m: eles.length > 0 ? Math.min(...eles) : null,
    duration_s: Math.round(durationS),
    moving_s: Math.round(movingS),
    avg_speed_kmh: Number(avgSpeed.toFixed(2)),
    max_speed_kmh: Number(maxSpeed.toFixed(2)),
    point_count: n,
    dims,
    splits: computeSplits(points, dims.time, dims.ele),
    stops,
    series: {
      times,
      dists: points.map((p) => p.dist_m ?? 0),
      eles: dims.ele ? points.map((p) => p.ele ?? null) : null,
      speeds: dims.speed ? (speeds as (number | undefined)[]).map((v) => v ?? null) : null,
      cum_times: cumTimes,
    },
  }
}
