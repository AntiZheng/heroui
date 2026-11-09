// 手绘 SVG 时序曲线图：折线（速度序列按速度值渐变着色，与地图轨迹同一套配色）+ 网格 + hover 十字线/tooltip + 图表-地图联动回调
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fmtDistance, fmtDuration } from '../../lib/track/format'
import { colorScaleMax, speedColor } from './speedColors'
import type { KmSplit } from '../../types/track'

export interface ChartSeries {
  key: string
  label: string
  color: string
  unit: string
  values: (number | null)[]
}

interface TrackChartProps {
  /** 每个下标的 X 值（秒或米），与 series.values 等长 */
  xValues: (number | null)[]
  xKind: 'time' | 'distance'
  /** 时间模式下轨迹起点时刻（epoch ms）：传入后横轴显示真实时钟时间，否则显示相对时长 */
  timeOriginMs?: number
  series: ChartSeries[]
  activeIndex?: number | null
  onHoverIndex?: (i: number | null) => void
  height?: number
}

const M = { top: 12, right: 16, bottom: 26, left: 52 }
const PAD_Y = 0.08 // Y 轴上下留白比例
const ELE_GRAD_BOTTOM = '#a7f3d0' // 海拔竖向渐变底色（emerald-200）

function niceDomain(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) return [min - 1, max + 1]
  return [min, max]
}

function fmtX(v: number, kind: 'time' | 'distance', originMs?: number): string {
  if (kind === 'time') {
    if (originMs != null) {
      const d = new Date(originMs + v * 1000)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return fmtDuration(v)
  }
  return fmtDistance(v)
}

function fmtY(v: number, unit: string): string {
  if (unit === 'km/h') return v.toFixed(1)
  if (unit === 'min/km') {
    const m = Math.floor(v / 60)
    const s = Math.round(v % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return Math.round(v).toString()
}

export function TrackChart({
  xValues,
  xKind,
  timeOriginMs,
  series,
  activeIndex = null,
  onHoverIndex,
  height = 220,
}: TrackChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [wrapH, setWrapH] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(w)
      setWrapH(el.clientHeight)
    })
    ro.observe(el)
    setWrapH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // 高度跟随容器（配合父级 flex-1 自动铺满卡片），不低于 height 下限
  const chartH = Math.max(height, Math.floor(wrapH))
  const n = xValues.length
  const plot = { w: Math.max(80, width - M.left - M.right), h: chartH - M.top - M.bottom }

  // X 轴域与有效下标集合
  const valid = useMemo(
    () => xValues.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v)),
    [xValues],
  )
  const xDomain = useMemo<[number, number]>(() => {
    if (valid.length === 0) return [0, 1]
    return niceDomain(valid[0].v, valid[valid.length - 1].v)
  }, [valid])

  // 每条序列的 Y 域（最多双序列，第二条独立右轴）
  const yDomains = useMemo<[number, number][]>(
    () =>
      series.map((s) => {
        let min = Infinity
        let max = -Infinity
        for (let i = 0; i < n; i++) {
          const v = s.values[i]
          if (v == null || !Number.isFinite(v)) continue
          if (xValues[i] == null) continue
          if (v < min) min = v
          if (v > max) max = v
        }
        const [lo, hi] = niceDomain(min, max)
        const pad = (hi - lo) * PAD_Y
        // 速度纵轴下限钳制为 0：平滑后的瞬时速度可能略低于 0，不允许出现负刻度
        const y0 = s.unit === 'km/h' ? Math.max(0, lo - pad) : lo - pad
        return [y0, hi + pad]
      }),
    [series, xValues, n],
  )

  const px = (x: number) => M.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plot.w
  const py = (v: number, si: number) =>
    M.top + (1 - (v - yDomains[si][0]) / (yDomains[si][1] - yDomains[si][0])) * plot.h

  // 每条序列的折线路径（null 处断开）
  const paths = series.map((s, si) => {
    let d = ''
    let pen = false
    for (let i = 0; i < n; i++) {
      const v = s.values[i]
      const x = xValues[i]
      if (v == null || !Number.isFinite(v) || x == null) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${px(x).toFixed(1)},${py(v, si).toFixed(1)}`
      pen = true
    }
    return d
  })

  // 序列渐变：速度沿线按速度取色（speedColor 绿→黄→红）；海拔为竖向渐变（高处深、低处浅），≤64 个色标
  const gradId = useId()
  const gradients = useMemo(() => {
    return series.map((s) => {
      if (s.key === 'speed') {
        // 与地图轨迹同一取色口径：95 分位 ×1.15 做色标上限，
        // 避免 GPS 毛刺超速点把上限拉爆、正常速度段整条全绿
        const vmax = colorScaleMax(s.values)
        if (vmax <= 0) return null
        const stops: { offset: number; color: string }[] = []
        const stride = Math.max(1, Math.floor(valid.length / 64))
        for (let k = 0; k < valid.length; k += stride) {
          const idx = valid[k].i
          const sv = s.values[idx]
          if (sv == null || !Number.isFinite(sv)) continue
          const offset = Math.min(Math.max((px(xValues[idx]!) - M.left) / plot.w, 0), 1)
          stops.push({ offset, color: speedColor(sv, vmax) })
        }
        if (stops.length < 2) return null
        return { id: `${gradId}-${s.key}`, dir: 'x' as const, stops }
      }
      if (s.key === 'ele') {
        // 竖向渐变：描边颜色随曲线高低变化（顶部=系列色，底部=浅色），同时用作曲线下填充
        return {
          id: `${gradId}-${s.key}`,
          dir: 'y' as const,
          stops: [
            { offset: 0, color: s.color },
            { offset: 1, color: ELE_GRAD_BOTTOM },
          ],
        }
      }
      return null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, valid, width, chartH, gradId])

  // 海拔曲线下方渐变填充（经典海拔剖面样式）
  const areas = useMemo(() => {
    const bottomY = M.top + plot.h
    return series.map((s, si) => {
      if (s.key !== 'ele') return null
      let firstX: number | null = null
      let lastX: number | null = null
      for (let i = 0; i < n; i++) {
        const v = s.values[i]
        const x = xValues[i]
        if (v == null || !Number.isFinite(v) || x == null) continue
        if (firstX == null) firstX = x
        lastX = x
      }
      if (firstX == null || lastX == null) return null
      return `${paths[si]}L${px(lastX).toFixed(1)},${bottomY}L${px(firstX).toFixed(1)},${bottomY}Z`
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, paths, width, chartH])

  const yTicks = 4
  // 横轴刻度数量随绘图区宽度自适应（约每 90px 一档，4~10 档），拉伸窗口时刻度自动增密/减密
  const xTickCount = Math.min(10, Math.max(4, Math.floor(plot.w / 90)))

  const xTickValues = useMemo(() => {
    if (valid.length === 0) return []
    const ticks: number[] = []
    for (let k = 0; k <= xTickCount; k++) {
      ticks.push(xDomain[0] + ((xDomain[1] - xDomain[0]) * k) / xTickCount)
    }
    return ticks
  }, [xDomain, valid.length, xTickCount])

  const hoverIdx = hover != null && hover >= 0 && hover < n ? hover : null
  const cursorIdx = hoverIdx ?? activeIndex
  const cursorX = cursorIdx != null ? xValues[cursorIdx] : null

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (valid.length === 0 || n === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const ratio = (mx - M.left) / plot.w
    const target = xDomain[0] + Math.min(1, Math.max(0, ratio)) * (xDomain[1] - xDomain[0])
    // 就近有效下标
    let lo = 0
    let hi = valid.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (valid[mid].v < target) lo = mid + 1
      else hi = mid
    }
    const idx = valid[lo].i
    if (idx !== hover) {
      setHover(idx)
      onHoverIndex?.(idx)
    }
  }

  const handleLeave = () => {
    setHover(null)
    onHoverIndex?.(null)
  }

  // tooltip 位置（HTML 覆盖层）
  const tipLeft = cursorX != null ? px(cursorX) : 0
  const tipFlip = tipLeft > M.left + plot.w * 0.6

  return (
    // absolute 脱离布局流：SVG 高度不反撑卡片，容器变矮时图表同步收缩
    <div ref={wrapRef} className="absolute inset-0 w-full select-none overflow-hidden">
      <svg
        width={width}
        height={chartH}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="block"
        role="img"
      >
        {/* 水平网格与 Y 轴刻度（主序列） */}
        {Array.from({ length: yTicks + 1 }, (_, k) => {
          const v = yDomains[0][0] + ((yDomains[0][1] - yDomains[0][0]) * k) / yTicks
          const y = py(v, 0)
          return (
            <g key={k}>
              <line x1={M.left} x2={M.left + plot.w} y1={y} y2={y} className="stroke-separator" strokeWidth={1} />
              <text x={M.left - 6} y={y + 3} textAnchor="end" className="fill-muted text-[10px]">
                {fmtY(v, series[0]?.unit ?? '')}
              </text>
            </g>
          )
        })}
        {/* X 轴刻度 */}
        {xTickValues.map((v, k) => (
          <text
            key={k}
            x={px(v)}
            y={chartH - 8}
            textAnchor={k === 0 ? 'start' : k === xTickCount ? 'end' : 'middle'}
            className="fill-muted text-[10px]"
          >
            {fmtX(v, xKind, timeOriginMs)}
          </text>
        ))}
        {/* 序列渐变定义（userSpaceOnUse：速度沿 X 轴取色 / 海拔沿 Y 轴取色） */}
        {gradients.map(
          (g) =>
            g ? (
              <linearGradient
                key={g.id}
                id={g.id}
                gradientUnits="userSpaceOnUse"
                x1={g.dir === 'y' ? 0 : M.left}
                y1={g.dir === 'y' ? M.top : 0}
                x2={g.dir === 'y' ? 0 : M.left + plot.w}
                y2={g.dir === 'y' ? M.top + plot.h : 0}
              >
                {g.stops.map((st, k) => (
                  <stop key={k} offset={st.offset} stopColor={st.color} />
                ))}
              </linearGradient>
            ) : null,
        )}
        {/* 海拔曲线下方渐变填充 */}
        {areas.map(
          (d, si) =>
            d ? (
              <path
                key={`area-${series[si].key}`}
                d={d}
                fill={`url(#${gradId}-${series[si].key})`}
                opacity={0.16}
              />
            ) : null,
        )}
        {/* 序列折线：速度/海拔序列用渐变描边，其余用单色 */}
        {paths.map((d, si) => {
          const g = gradients[si]
          const stroke = g ? `url(#${g.id})` : series[si].color
          return (
            <path
              key={series[si].key}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          )
        })}
        {/* hover/active 十字线与点 */}
        {cursorX != null && cursorIdx != null ? (
          <g>
            <line
              x1={px(cursorX)}
              x2={px(cursorX)}
              y1={M.top}
              y2={M.top + plot.h}
              className="stroke-separator"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s, si) => {
              const v = s.values[cursorIdx]
              const x = xValues[cursorIdx]
              if (v == null || x == null) return null
              return (
                <circle
                  key={s.key}
                  cx={px(x)}
                  cy={py(v, si)}
                  r={3.5}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )
            })}
          </g>
        ) : null}
      </svg>
      {/* tooltip */}
      {cursorIdx != null && cursorX != null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={tipFlip ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }}
        >
          <p className="mb-0.5 text-muted">{fmtX(cursorX, xKind, timeOriginMs)}</p>
          {series.map((s) => {
            const v = s.values[cursorIdx]
            return (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium text-foreground">
                  {v == null ? '—' : `${fmtY(v, s.unit)} ${s.unit}`}
                </span>
              </p>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ---- 每公里分段条形图 ----

interface SplitsChartProps {
  splits: KmSplit[]
  height?: number
}

// 平均速度 → 颜色透明度（快=深）
function speedOpacity(v: number, min: number, max: number): number {
  if (max <= min) return 0.75
  return 0.35 + 0.6 * ((v - min) / (max - min))
}

// 分段过多时的最小格宽（px）：低于该宽度不再压缩柱子，改为容器横向滚动（隐藏滚动条）
const SPLITS_MIN_CELL = 26

export function SplitsChart({ splits, height = 160 }: SplitsChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  // 宽高均由父级（flex-1 容器）决定：ResizeObserver 实测后柱状图铺满容器
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(0)
  const [wrapH, setWrapH] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setWrapW(el.clientWidth)
      setWrapH(el.clientHeight)
    })
    ro.observe(el)
    setWrapW(el.clientWidth)
    setWrapH(el.clientHeight)
    return () => ro.disconnect()
  }, [])
  // 纵向滚轮/触摸板滑动 → 横向平移（滚动条隐藏后的滚动方式）；不可滚动时不拦截页面滚动
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (dx === 0) return
      e.preventDefault()
      el.scrollLeft += dx
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const speeds = splits.map((s) => s.avg_speed_kmh)
  const min = Math.min(...speeds)
  const max = Math.max(...speeds)
  // 柱子细长样式：分段少时铺满容器；分段多时每段保证最小格宽，超出部分横向滚动
  const barGap = 3
  const contentW = Math.max(wrapW, splits.length * SPLITS_MIN_CELL)
  const cell = splits.length > 0 && contentW > 0 ? contentW / splits.length : 0
  const barW = Math.max(2, Math.min(cell - barGap, cell * 0.5))
  const maxSpeed = Math.max(max, 0.1)
  const chartW = contentW
  const chartH = wrapH || height

  if (splits.length === 0) {
    return <p className="py-8 text-center text-xs text-muted">暂无分段数据（需要时间信息）</p>
  }

  return (
    // 外层 relative 承载悬浮提示（不随滚动移动）；内层横向滚动并隐藏滚动条
    <div className="absolute inset-0">
      <div
        ref={wrapRef}
        className="h-full w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <svg width={chartW} height={chartH} className="block" role="img">
          {splits.map((s, i) => {
            const h = Math.max(4, (s.avg_speed_kmh / maxSpeed) * (chartH - 30))
            const x = i * cell + (cell - barW) / 2
            const y = chartH - 22 - h
            return (
              <g key={s.index} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={2}
                  className="fill-accent"
                  opacity={hover != null && hover !== i ? 0.35 : speedOpacity(s.avg_speed_kmh, min, max)}
                />
                {/* 格位过窄时隔一显示公里数，避免数字重叠 */}
                {cell >= 11 || s.index % 2 === 1 ? (
                  <text x={x + barW / 2} y={chartH - 8} textAnchor="middle" className="fill-muted text-[9px]">
                    {s.index}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      {hover != null && splits[hover] ? (
        <div className="pointer-events-none absolute -top-1 right-0 z-10 min-w-40 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg">
          <p className="mb-0.5 font-medium text-foreground">第 {splits[hover].index} 公里</p>
          <p className="text-muted">
            用时 <span className="font-medium text-foreground">{fmtDuration(splits[hover].duration_s)}</span>
          </p>
          <p className="text-muted">
            均速 <span className="font-medium text-foreground">{splits[hover].avg_speed_kmh.toFixed(1)} km/h</span>
            {splits[hover].pace_s_per_km != null ? (
              <>
                {' '}· 配速{' '}
                <span className="font-medium text-foreground">
                  {Math.floor(splits[hover].pace_s_per_km / 60)}'
                  {String(Math.round(splits[hover].pace_s_per_km % 60)).padStart(2, '0')}"
                </span>
              </>
            ) : null}
          </p>
          <p className="text-muted">
            爬升 <span className="font-medium text-foreground">{splits[hover].ascent_m} m</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}
