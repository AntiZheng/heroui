// 轨迹数据类型定义（与后端 biz_track 表 / /track 接口契约对应，snake_case）

// 轨迹点（前端内存表示，坐标 WGS-84）
export interface TrackPoint {
  lng: number
  lat: number
  ele?: number // 海拔（米）
  time?: number // Unix 毫秒时间戳
  speed_kmh?: number // 瞬时速度（km/h，滑动平均平滑后）
  bearing?: number // 运动方位角（度，正北为 0，顺时针）
  dist_m?: number // 距起点的累计里程（米）
}

// 指标摘要（对应 biz_track 指标摘要列）
export interface TrackMetrics {
  distance_m: number
  ascent_m: number
  descent_m: number
  max_ele_m: number | null
  min_ele_m: number | null
  duration_s: number
  moving_s: number
  avg_speed_kmh: number
  max_speed_kmh: number
  point_count: number
}

// 数据可用维度（KML 常缺时间戳、GPX 可能缺海拔）
export interface TrackDims {
  time: boolean
  ele: boolean
  speed: boolean
}

// 每公里分段
export interface KmSplit {
  index: number // 第几公里（1 起）
  start_dist_m: number
  end_dist_m: number
  duration_s: number
  avg_speed_kmh: number
  pace_s_per_km: number | null // 配速（秒/公里），仅时间维度可用
  ascent_m: number
  start_time?: number
  end_time?: number
}

// 停靠段
export interface TrackStop {
  start_index: number
  end_index: number
  start_dist_m: number
  end_dist_m: number
  duration_s: number
}

// 时序数据（与轨迹点按下标对齐）
export interface TrackTimeSeries {
  times: (number | null)[] | null // epoch ms
  dists: number[] // 累计里程（米）
  eles: (number | null)[] | null // 海拔（米）
  speeds: (number | null)[] | null // 平滑速度（km/h）
  cum_times: (number | null)[] | null // 相对起点的累计秒数
}

// 指标分析总输出
export interface TrackAnalysis extends TrackMetrics {
  dims: TrackDims
  splits: KmSplit[]
  stops: TrackStop[]
  series: TrackTimeSeries
}

// GeoJSON 存储结构：LineString 坐标第三位=海拔，逐点 time/speed/dist 放 properties.meta
export interface TrackGeoJSONMeta {
  times?: (string | null)[]
  speed_kmh?: (number | null)[]
  bearing?: (number | null)[]
  dist_m?: number[]
}

export interface TrackGeoJSON {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { name?: string; meta?: TrackGeoJSONMeta }
    geometry: {
      type: 'LineString'
      coordinates: [number, number, number?][]
    }
  }[]
}

// 列表行（不含 geojson 大字段）
export interface TrackRow extends TrackMetrics {
  track_id: number
  track_name: string
  track_type: 'gpx' | 'kml' | 'kmz' | null
  activity_type?: string | null
  file_id?: number | null
  file_name?: string | null
  start_time?: string | null
  end_time?: string | null
  // OSM 路段解析状态（异步任务回写，见后端 road_parse）
  road_status?: '0' | '1' | '2' | '3' | null
  road_matched_pct?: number | null
  remark?: string | null
  create_by?: string | null
  create_time?: string | null
  update_time?: string | null
}

// 详情（含轨迹数据）
export interface TrackDetail extends TrackRow {
  geojson: TrackGeoJSON
}

// 新增载荷
export interface TrackPayload extends TrackMetrics {
  track_name: string
  track_type: 'gpx' | 'kml' | 'kmz'
  activity_type?: string | null
  file_id?: number | null
  file_name?: string | null
  start_time?: string | null
  end_time?: string | null
  remark?: string | null
  geojson: TrackGeoJSON
}

// 修改载荷（改名/备注/类型）
export interface TrackUpdatePayload {
  track_id: number
  track_name?: string
  activity_type?: string | null
  remark?: string | null
}

// OSM 路段解析结果行（biz_track_road 精简字段，统计在前端完成）
export interface TrackRoadRow {
  seq: number // 路段序号（按里程递增，1 起展示时 +1）
  dist_s: number // 起始里程（米）
  dist_e: number // 结束里程（米）
  road_cls: string // OSM class（motorway/trunk/primary…）
  subclass?: string | null
  surface?: string | null
  brunnel?: string | null // bridge/tunnel/ford
  toll?: number | null
  expressway?: number | null
  ramp?: number | null
  service?: string | null
  name?: string | null
  name_zh?: string | null
  ref?: string | null
  maxspeed?: string | null
  avg_spd?: number | null // 区间均速（km/h）
}

// 路段解析查询结果
export interface TrackRoadsResult {
  segments: TrackRoadRow[]
  matched_pct: number | null
  matcher: string | null
}

// 解析结果（导入预览用）
export interface ParsedTrack {
  name: string
  type: 'gpx' | 'kml' | 'kmz'
  points: TrackPoint[]
  geojson: TrackGeoJSON
  dims: TrackDims
}
