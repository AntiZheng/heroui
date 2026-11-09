// 轨迹指标格式化工具

// 里程：>=1km 显示 km，否则米
export function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

// 时长：1:23:45 / 23:45
export function fmtDuration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—'
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// 配速：5'42"/km
export function fmtPace(sPerKm: number | null | undefined): string {
  if (sPerKm == null || !Number.isFinite(sPerKm) || sPerKm <= 0) return '—'
  const m = Math.floor(sPerKm / 60)
  const s = Math.round(sPerKm % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

// 速度：12.4 km/h
export function fmtSpeed(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(1)} km/h`
}

// 海拔：152 m
export function fmtEle(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v)} m`
}

// 时间戳：HH:mm:ss（当天）或完整日期
export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
