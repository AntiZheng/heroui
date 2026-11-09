// GPX / KML / KMZ 文件解析：统一转 GeoJSON 再抽取轨迹点序列
import { gpx, kml } from '@tmcw/togeojson'
import JSZip from 'jszip'
import { haversineMeters, type LngLat } from '../geo'
import type { ParsedTrack, TrackDims, TrackGeoJSON, TrackPoint } from '../../types/track'

type RawFeatureCollection = {
  features: {
    type: string
    geometry: { type: string; coordinates: unknown } | null
    properties: Record<string, unknown> | null
  }[]
}

// 解析 XML 文本；格式非法时抛错
function parseXml(text: string, hint: string): Document {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`${hint} 不是有效的 XML 文件`)
  }
  return doc
}

// KMZ：zip 包内提取 KML 文本（优先 doc.kml）
async function extractKmlFromKmz(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer()).catch(() => {
    throw new Error('KMZ 文件损坏或不是有效的 zip 压缩包')
  })
  const entries = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith('.kml'))
  if (entries.length === 0) throw new Error('KMZ 压缩包内未找到 KML 文件')
  const entry =
    zip.files[entries.find((n) => n.toLowerCase() === 'doc.kml') ?? entries[0]]
  return entry.async('string')
}

// 单条轨迹段（一个 trkseg / KML LineString）
type RawLine = {
  coords: [number, number, number?][]
  times: (string | null)[] | null // ISO 时间字符串
  speeds: (number | null)[] | null // 设备记录速度（m/s，来自 gpxtpx:speed）
  bearings: (number | null)[] | null // 方位角（度，来自 gpxtpx:bearing）
}

// togeojson 对单段轨迹输出扁平数组、多段输出按段嵌套数组；统一取出第 segIdx 段。
// 长度与该段坐标数不一致（存在无效点被跳过等）时返回 null，避免下标错位。
function perSegment(
  arr: unknown,
  segIdx: number,
  segLen: number,
): (string | number | null)[] | null {
  if (!Array.isArray(arr)) return null
  const isNested = arr.some((v) => Array.isArray(v))
  const flat = isNested ? (arr[segIdx] as unknown) : arr
  if (!Array.isArray(flat) || flat.length !== segLen) return null
  return flat as (string | number | null)[]
}

// 收集全部轨迹线要素（LineString / MultiLineString 按段拆开），保留文档顺序。
// KML 时间在 properties.coordTimes，GPX 时间/速度/方位角在 properties.coordinateProperties。
function pickLines(fc: RawFeatureCollection): { lines: RawLine[]; name?: string } {
  const lines: RawLine[] = []
  let name: string | undefined
  for (const f of fc.features) {
    const geom = f.geometry
    if (!geom) continue
    const segs: unknown[] =
      geom.type === 'LineString'
        ? [geom.coordinates]
        : geom.type === 'MultiLineString'
          ? (geom.coordinates as unknown[])
          : []
    if (segs.length === 0) continue
    const coordProps = f.properties?.coordinateProperties as
      | { times?: unknown; speeds?: unknown; bearings?: unknown }
      | undefined
    const rawTimes = f.properties?.coordTimes ?? coordProps?.times
    segs.forEach((rawCoords, si) => {
      if (!Array.isArray(rawCoords) || rawCoords.length < 2) return
      const coords = rawCoords as [number, number, number?][]
      const times = (perSegment(rawTimes, si, coords.length) as (string | null)[] | null) ?? null
      const speeds = (perSegment(coordProps?.speeds, si, coords.length) as (number | null)[] | null) ?? null
      const bearings = (perSegment(coordProps?.bearings, si, coords.length) as (number | null)[] | null) ?? null
      lines.push({ coords, times, speeds, bearings })
    })
    if (name == null && typeof f.properties?.name === 'string') name = f.properties.name
  }
  return { lines, name }
}

// 多段轨迹按文档顺序拼接为一条完整轨迹（段间停顿自然形成大时间差，由停靠检测识别）
function concatLines(lines: RawLine[]): RawLine {
  const coords: [number, number, number?][] = []
  const times: (string | null)[] = []
  const speeds: (number | null)[] = []
  const bearings: (number | null)[] = []
  let hasTime = false
  let hasSpeed = false
  let hasBearing = false
  for (const l of lines) {
    for (let i = 0; i < l.coords.length; i++) {
      coords.push(l.coords[i])
      const t = l.times?.[i] ?? null
      times.push(t)
      if (t != null) hasTime = true
      const s = l.speeds?.[i] ?? null
      speeds.push(s)
      if (s != null) hasSpeed = true
      const b = l.bearings?.[i] ?? null
      bearings.push(b)
      if (b != null) hasBearing = true
    }
  }
  return {
    coords,
    times: hasTime ? times : null,
    speeds: hasSpeed ? speeds : null,
    bearings: hasBearing ? bearings : null,
  }
}

// 从 GPX DOM 按文档顺序提取每个 trkpt 的 hdop（水平精度衰减因子，越小越准）；
// KML 或无 hdop 时返回 null
function extractHdops(doc: Document): (number | null)[] | null {
  const trkpts = doc.getElementsByTagName('trkpt')
  if (trkpts.length === 0) return null
  const out: (number | null)[] = []
  for (const el of Array.from(trkpts)) {
    const v = Number.parseFloat(el.getElementsByTagName('hdop')[0]?.textContent ?? '')
    out.push(Number.isFinite(v) ? v : null)
  }
  return out
}

// hdop > 该值视为严重低精度点（漂移/未定位），任意位置直接剔除
const HDOP_DROP_MAX = 5
// 轨迹首尾的定位尚未收敛（hdop ≥ 该值），逐点剔除直至遇到收敛点
const HDOP_EDGE_MAX = 1.5

// 按 hdop 剔除坏点：首尾未收敛点（防止起点海拔/位置跳变）+ 中部严重漂移点
function trimByHdop(line: RawLine, hdops: (number | null)[]): RawLine {
  let start = 0
  let end = line.coords.length
  while (start < end) {
    const h = hdops[start]
    if (h == null || h < HDOP_EDGE_MAX) break
    start++
  }
  while (end > start) {
    const h = hdops[end - 1]
    if (h == null || h < HDOP_EDGE_MAX) break
    end--
  }
  const coords: [number, number, number?][] = []
  const times: (string | null)[] = []
  const speeds: (number | null)[] = []
  const bearings: (number | null)[] = []
  let hasTime = false
  let hasSpeed = false
  let hasBearing = false
  for (let i = start; i < end; i++) {
    const h = hdops[i]
    if (h != null && h > HDOP_DROP_MAX) continue
    coords.push(line.coords[i])
    const t = line.times?.[i] ?? null
    times.push(t)
    if (t != null) hasTime = true
    const s = line.speeds?.[i] ?? null
    speeds.push(s)
    if (s != null) hasSpeed = true
    const b = line.bearings?.[i] ?? null
    bearings.push(b)
    if (b != null) hasBearing = true
  }
  return {
    coords,
    times: hasTime ? times : null,
    speeds: hasSpeed ? speeds : null,
    bearings: hasBearing ? bearings : null,
  }
}

// 由原始坐标+时间序列构建轨迹点：累计里程 + 瞬时速度（km/h）
function buildPoints(
  coords: [number, number, number?][],
  timeStrings: (string | null)[] | null,
  deviceSpeeds: (number | null)[] | null,
  bearings: (number | null)[] | null,
): TrackPoint[] {
  // 小米运动健康等导出工具会把本地墙上时间直接加 "Z" 后缀（错误标记为 UTC），
  // 导致显示时被换算 +8h。此类"纯日期T时间Z"格式按本地时间解释（剥掉 Z）。
  const times = timeStrings?.map((t) => {
    if (!t) return NaN
    const ms = Date.parse(t)
    if (!Number.isFinite(ms)) return NaN
    if (/^\d{4}-\d{2}-\d{2}T\d{2}(:\d{2}){2}(\.\d+)?Z$/.test(t)) {
      return Date.parse(t.slice(0, -1)) // Z → 本地时间
    }
    return ms
  }) ?? null
  const hasTime = !!times && times.some((t) => Number.isFinite(t))
  const points: TrackPoint[] = []
  let dist = 0
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, ele] = coords[i]
    const ll: LngLat = [lng, lat]
    if (i > 0) dist += haversineMeters(coords[i - 1].slice(0, 2) as LngLat, ll)
    const point: TrackPoint = { lng, lat, dist_m: dist }
    if (typeof ele === 'number' && Number.isFinite(ele)) point.ele = ele
    if (hasTime && times && Number.isFinite(times[i])) point.time = times[i]
    const brg = bearings?.[i]
    if (typeof brg === 'number' && Number.isFinite(brg)) point.bearing = brg
    points.push(point)
  }
  // 瞬时速度：优先采用设备记录值（多普勒测速，gpxtpx:speed，m/s），
  // 缺失时回退为相邻点距离/时间差（后续由 metrics 做滑动平均平滑）
  for (let i = 0; i < points.length; i++) {
    const dev = deviceSpeeds?.[i]
    if (typeof dev === 'number' && Number.isFinite(dev) && dev >= 0) {
      points[i].speed_kmh = dev * 3.6
      continue
    }
    if (i === 0) continue
    const a = points[i - 1]
    const b = points[i]
    if (a.time != null && b.time != null) {
      const dt = (b.time - a.time) / 1000
      const dd = (b.dist_m ?? 0) - (a.dist_m ?? 0)
      if (dt > 0 && dd >= 0) b.speed_kmh = (dd / dt) * 3.6
    }
  }
  return points
}

function buildGeoJSON(name: string, coords: [number, number, number?][], points: TrackPoint[]): TrackGeoJSON {
  const times = points.every((p) => p.time == null)
    ? undefined
    : points.map((p) => (p.time != null ? new Date(p.time).toISOString() : null))
  const meta = {
    ...(times ? { times } : {}),
    ...(points.some((p) => p.speed_kmh != null)
      ? { speed_kmh: points.map((p) => p.speed_kmh ?? null) }
      : {}),
    ...(points.some((p) => p.bearing != null)
      ? { bearing: points.map((p) => p.bearing ?? null) }
      : {}),
    dist_m: points.map((p) => Math.round(p.dist_m ?? 0)),
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name, meta },
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  }
}

// 解析入口：GPX/KML/KMZ → ParsedTrack（坐标 WGS-84）
export async function parseTrackFile(file: File): Promise<ParsedTrack> {
  const lower = file.name.toLowerCase()
  let type: ParsedTrack['type']
  let xmlText: string
  if (lower.endsWith('.gpx')) {
    type = 'gpx'
    xmlText = await file.text()
  } else if (lower.endsWith('.kml')) {
    type = 'kml'
    xmlText = await file.text()
  } else if (lower.endsWith('.kmz')) {
    type = 'kmz'
    xmlText = await extractKmlFromKmz(file)
  } else {
    throw new Error('仅支持 GPX / KML / KMZ 格式文件')
  }

  const doc = parseXml(xmlText, file.name)
  const fc: RawFeatureCollection = (
    type === 'gpx' ? gpx(doc) : kml(doc)
  ) as unknown as RawFeatureCollection
  const { lines, name } = pickLines(fc)
  if (lines.length === 0) throw new Error('文件中未找到可用的轨迹线（LineString）')
  let merged = concatLines(lines)
  // GPX hdop 精度过滤（KML 无 hdop，跳过）；数量与坐标不一致时弃用，避免错位
  const hdops = extractHdops(doc)
  if (hdops && hdops.length === merged.coords.length) merged = trimByHdop(merged, hdops)

  const points = buildPoints(merged.coords, merged.times, merged.speeds, merged.bearings)
  const dims: TrackDims = {
    time: points.some((p) => p.time != null),
    ele: points.some((p) => p.ele != null),
    speed: points.some((p) => p.speed_kmh != null),
  }
  const baseName = file.name.replace(/\.(gpx|kml|kmz)$/i, '')
  return {
    name: name || baseName,
    type,
    points,
    geojson: buildGeoJSON(name || baseName, merged.coords, points),
    dims,
  }
}

// 存储的 GeoJSON 还原为轨迹点（详情页展示用）
export function geoJSONToPoints(geojson: TrackGeoJSON): TrackPoint[] {
  const feature = geojson.features.find((f) => f.geometry?.type === 'LineString')
  if (!feature) return []
  const coords = feature.geometry.coordinates
  const meta = feature.properties?.meta
  const times = meta?.times
  const speeds = meta?.speed_kmh
  const dists = meta?.dist_m
  const brgs = meta?.bearing
  return coords.map(([lng, lat, ele], i) => {
    const p: TrackPoint = { lng, lat }
    if (typeof ele === 'number' && Number.isFinite(ele)) p.ele = ele
    const t = times?.[i]
    if (t) {
      const ms = Date.parse(t)
      if (Number.isFinite(ms)) p.time = ms
    }
    if (speeds?.[i] != null) p.speed_kmh = speeds[i]
    if (brgs?.[i] != null) p.bearing = brgs[i]
    if (dists?.[i] != null) p.dist_m = dists[i]
    return p
  })
}
