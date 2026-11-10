// Recharts 时序曲线图：折线（速度序列按速度值渐变着色，与地图轨迹同一套配色）+ hover 十字线/tooltip + 图表-地图联动回调
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmtDistance, fmtDuration } from '../../lib/track/format'
import { colorScaleMax, speedColor } from './speedColors'
import type { KmSplit } from '../../types/track'
import type { YAxisTickContentProps } from 'recharts'

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

const TICK_STYLE = { fontSize: 10, fill: 'var(--muted)' } as const
const ELE_GRAD_BOTTOM = '#a7f3d0' // 海拔竖向渐变底色（emerald-200）

// Y 轴自定义刻度：Recharts 内置 Text 组件按估算宽度会把 "80 km/h" 这类标签强制折行，直接渲染单行 SVG text 绕过
const renderYTick =
  (unit: string) =>
  ({ x, y, payload }: YAxisTickContentProps) => (
    <text x={Number(x)} y={Number(y) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
      {fmtY(Number(payload.value), unit)}
    </text>
  )

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
  let label: string
  if (unit === 'km/h') label = String(parseFloat(v.toFixed(1)))
  else if (unit === 'km') label = String(parseFloat(v.toFixed(2)))
  else label = Math.round(v).toString()
  return unit ? `${label} ${unit}` : label
}

export function TrackChart({
  xValues,
  xKind,
  timeOriginMs,
  series,
  activeIndex = null,
  onHoverIndex,
}: TrackChartProps) {
  const gradId = useId()
  const n = xValues.length

  // 行数据：x 有效（非空）的轨迹点；行内保留原下标 i 用于地图联动，序列值平铺在顶层供 dataKey 读取
  const rows = useMemo(() => {
    const list: ({ x: number; i: number } & Record<string, number | null>)[] = []
    for (let i = 0; i < n; i++) {
      const x = xValues[i]
      if (x == null || !Number.isFinite(x)) continue
      const row: (typeof list)[number] = { x, i }
      for (const s of series) row[s.key] = s.values[i] ?? null
      list.push(row)
    }
    return list
  }, [xValues, series, n])

  // 序列渐变：速度沿线按速度取色（speedColor 绿→黄→红）；海拔为竖向渐变（高处深、低处浅）
  const gradients = useMemo(() => {
    return series.map((s) => {
      if (s.key === 'speed') {
        // 与地图轨迹同一取色口径：95 分位 ×1.15 做色标上限，
        // 避免 GPS 毛刺超速点把上限拉爆、正常速度段整条全绿
        const vmax = colorScaleMax(s.values)
        if (vmax <= 0 || rows.length < 2) return null
        const xMin = rows[0].x
        const xMax = rows[rows.length - 1].x
        const span = xMax - xMin || 1
        const stride = Math.max(1, Math.floor(rows.length / 64))
        const stops: { offset: number; color: string }[] = []
        for (let k = 0; k < rows.length; k += stride) {
          const sv = rows[k][s.key]
          if (sv == null || !Number.isFinite(sv)) continue
          stops.push({ offset: (rows[k].x - xMin) / span, color: speedColor(sv, vmax) })
        }
        if (stops.length < 2) return null
        stops[stops.length - 1].offset = 1
        return { id: `${gradId}-${s.key}`, dir: 'x' as const, stops }
      }
      if (s.key === 'ele') {
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
  }, [series, rows, gradId])

  // 地图联动选中点（map 点击/悬停同步回图表）
  const activeRow = activeIndex != null ? rows.find((r) => r.i === activeIndex) : undefined

  const handleMouseMove = (state: { activeTooltipIndex: number | string | null | undefined }) => {
    const idx = state?.activeTooltipIndex
    if (idx == null) return
    const row = rows[Number(idx)]
    onHoverIndex?.(row ? row.i : null)
  }
  const handleMouseLeave = () => onHoverIndex?.(null)

  if (rows.length === 0 || series.length === 0) {
    return <div className="absolute inset-0" />
  }

  return (
    <div className="absolute inset-0 w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        {/* ComposedChart：折线+海拔面积混排（Recharts v3 的 Area 在 LineChart 内不渲染） */}
        <ComposedChart
          data={rows}
          margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {gradients.map((g) =>
              g ? (
                <linearGradient key={g.id} id={g.id} x1={g.dir === 'y' ? 0 : 0} y1={g.dir === 'y' ? 0 : 0} x2={g.dir === 'y' ? 0 : 1} y2={g.dir === 'y' ? 1 : 0}>
                  {g.stops.map((st, k) => (
                    <stop key={k} offset={st.offset} stopColor={st.color} />
                  ))}
                </linearGradient>
              ) : null,
            )}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--separator)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            height={24}
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={(v: number) => fmtX(v, xKind, timeOriginMs)}
          />
          {series.map((s, si) => {
            // 累计里程与速度纵轴从 0 起：累计量单调递增、平滑速度可能略低于 0，均不允许负刻度
            const zeroBase = s.key === 'cumdist' || s.unit === 'km/h'
            const id = si === 0 ? 'y-main' : `y-${s.key}`
            return (
              <YAxis
                key={id}
                yAxisId={id}
                orientation={si === 0 ? 'left' : 'right'}
                width={si === 0 ? 56 : 48}
                domain={zeroBase ? [0, 'auto'] : ['auto', 'auto']}
                tickCount={5}
                tick={renderYTick(s.unit)}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => fmtY(v, s.unit)}
              />
            )
          })}
          <Tooltip
            cursor={{ stroke: 'var(--separator)', strokeDasharray: '3 3' }}
            isAnimationActive={false}
            content={(props) => {
              const { active, payload, label } = props
              if (!active || !payload?.length) return null
              return (
                <div className="min-w-32 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg">
                  <p className="mb-0.5 text-muted">{fmtX(Number(label), xKind, timeOriginMs)}</p>
                  {series.map((s) => {
                    const v = payload.find((p) => p.dataKey === s.key)?.value
                    if (v == null) return null
                    return (
                      <p key={s.key} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted">
                          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                        <span className="font-medium text-foreground">{fmtY(Number(v), s.unit)}</span>
                      </p>
                    )
                  })}
                </div>
              )
            }}
          />
          {activeRow ? (
            <ReferenceLine yAxisId="y-main" x={activeRow.x} stroke="var(--separator)" strokeDasharray="3 3" />
          ) : null}
          {series.map((s, si) => {
            const id = si === 0 ? 'y-main' : `y-${s.key}`
            const g = gradients[si]
            const stroke = g ? `url(#${g.id})` : s.color
            if (s.key === 'ele') {
              return (
                <Area
                  key={s.key}
                  yAxisId={id}
                  dataKey={s.key}
                  type="monotone"
                  stroke={stroke}
                  strokeWidth={1.8}
                  fill={`url(#${g?.id ?? gradId})`}
                  fillOpacity={0.16}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3.5, fill: s.color, stroke: '#fff', strokeWidth: 1.5 }}
                />
              )
            }
            return (
              <Line
                key={s.key}
                yAxisId={id}
                dataKey={s.key}
                type="monotone"
                stroke={stroke}
                strokeWidth={1.8}
                strokeLinejoin="round"
                connectNulls={false}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3.5, fill: s.color, stroke: '#fff', strokeWidth: 1.5 }}
              />
            )
          })}
          {activeRow
            ? series.map((s, si) => {
                const id = si === 0 ? 'y-main' : `y-${s.key}`
                const v = activeRow[s.key]
                if (v == null || !Number.isFinite(v)) return null
                return (
                  <ReferenceDot
                    key={s.key}
                    yAxisId={id}
                    x={activeRow.x}
                    y={v}
                    r={3.5}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                )
              })
            : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---- 每公里分段条形图（柱高=该公里配速，越高越慢） ----

interface SplitsChartProps {
  splits: KmSplit[]
  height?: number
}

// 配速刻度（秒/公里 → 5'30"）
function fmtPaceTick(v: number): string {
  const m0 = Math.floor(v / 60)
  const s0 = Math.round(v % 60)
  const m = s0 === 60 ? m0 + 1 : m0
  const s = s0 === 60 ? 0 : s0
  return `${m}'${String(s).padStart(2, '0')}"`
}

// 配速自定义刻度：与折线图同因绕过内置 Text 强制折行
const renderPaceTick = ({ x, y, payload }: YAxisTickContentProps) => (
  <text x={Number(x)} y={Number(y) + 3} textAnchor="start" fontSize={9} fill="var(--muted)">
    {fmtPaceTick(Number(payload.value))}
  </text>
)

// 均速 → 颜色透明度（快=深）
function speedOpacity(v: number, min: number, max: number): number {
  if (max <= min) return 0.75
  return 0.35 + 0.6 * ((v - min) / (max - min))
}

// 均速刻度：km/h 单行渲染（同绕过内置 Text 强制折行）
const renderSpeedTick = ({ x, y, payload }: YAxisTickContentProps) => (
  <text x={Number(x)} y={Number(y) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
    {fmtY(Number(payload.value), 'km/h')}
  </text>
)

// 配速刻度：右轴外侧渲染（textAnchor=start，x 在刻度线右侧）

// 分段悬浮提示（均速柱/配速线共用）
const renderSplitTooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
  const s = payload?.[0]?.payload as KmSplit | undefined
  if (!active || !s) return null
  return (
    <div className="min-w-40 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <p className="mb-0.5 font-medium text-foreground">第 {s.index} 公里</p>
      <p className="text-muted">
        用时 <span className="font-medium text-foreground">{fmtDuration(s.duration_s)}</span>
      </p>
      <p className="text-muted">
        均速 <span className="font-medium text-foreground">{s.avg_speed_kmh.toFixed(1)} km/h</span>
        {s.pace_s_per_km != null ? (
          <>
            {' '}· 配速{' '}
            <span className="font-medium text-foreground">
              {Math.floor(s.pace_s_per_km / 60)}'
              {String(Math.round(s.pace_s_per_km % 60)).padStart(2, '0')}"
            </span>
          </>
        ) : null}
      </p>
      <p className="text-muted">
        爬升 <span className="font-medium text-foreground">{s.ascent_m} m</span>
      </p>
    </div>
  )
}

// 分段过多时的最小格宽（px）：低于该宽度不再压缩柱子，改为绘图区横向滚动（隐藏滚动条）
const SPLITS_MIN_CELL = 26

const PACE_LINE_COLOR = '#f59e0b' // 配速折线颜色（琥珀，与速度蓝色柱对比；与 SERIES_COLORS.pace 一致）

// 左右纵轴固定不随绘图区横向滚动：拆成三个同高 ComposedChart 并排（左轴图 | 滚动绘图区 | 右轴图），
// 两侧显式 domain+ticks 保证刻度与中间图逐像素对齐（hide 轴不占位、空白 XAxis 占高，均经 jsdom 实测）
const SPEED_AXIS_W = 46
const PACE_AXIS_W = 44

export function SplitsChart({ splits, height = 160 }: SplitsChartProps) {
  // 宽高均由父级（flex-1 容器）决定：绘图区超出容器宽时横向滚动
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
  // 均速域：无效值不参与深浅映射
  const speeds = splits.map((s) => s.avg_speed_kmh).filter((v) => Number.isFinite(v))
  const minSpeed = speeds.length > 0 ? Math.min(...speeds) : 0
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 1
  // 均速轴：0 起整数步长（刻度 0/step/2*step）
  const speedStep = Math.max(1, Math.ceil((speeds.length ? Math.max(...speeds) : 1) / 2))
  const speedDomain = [0, speedStep * 2] as [number, number]
  const speedTicks = [0, speedStep, speedStep * 2]
  // 配速轴：按 30s 取整（刻度中点必为整 30s，fmtPaceTick 输出整洁）
  const paceVals = splits.map((s) => s.pace_s_per_km).filter((v): v is number => v != null && Number.isFinite(v))
  const pLo0 = paceVals.length ? Math.min(...paceVals) : 0
  const pHi0 = paceVals.length ? Math.max(...paceVals) : 60
  const pPad = Math.max(15, (pHi0 - pLo0) * 0.15)
  const paceLo = Math.max(0, Math.floor((pLo0 - pPad) / 30) * 30)
  const paceHi = Math.ceil((pHi0 + pPad) / 30) * 30
  const paceDomain = [paceLo, paceHi > paceLo ? paceHi : paceLo + 60] as [number, number]
  const paceTicks = [paceDomain[0], (paceDomain[0] + paceDomain[1]) / 2, paceDomain[1]]

  const centerW = Math.max(wrapW, splits.length * SPLITS_MIN_CELL)
  const cell = centerW / Math.max(1, splits.length)
  const chartH = wrapH || height
  // 侧轴图的空白 XAxis：只为占住与中间图相同的高度（hide 轴不占高，实测会让刻度上移错位）
  const blankX = <XAxis dataKey="index" height={20} interval={0} tick={false} tickLine={false} axisLine={false} />

  if (splits.length === 0) {
    return <p className="py-8 text-center text-xs text-muted">暂无分段数据（需要时间信息）</p>
  }

  return (
    // 外层 relative 承载悬浮提示；中间列横向滚动并隐藏滚动条，左右列固定
    <div className="absolute inset-0">
      <div className="flex h-full w-full">
        <div className="h-full shrink-0" style={{ width: SPEED_AXIS_W }}>
          <ComposedChart width={SPEED_AXIS_W} height={chartH} data={splits} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            {blankX}
            {/* hide 的 Bar 仅用于激活轴域（无图形元素时轴不渲染，实测） */}
            <Bar yAxisId="speed" dataKey="avg_speed_kmh" hide />
            <YAxis
              yAxisId="speed"
              orientation="left"
              width={SPEED_AXIS_W}
              domain={speedDomain}
              ticks={speedTicks}
              tick={renderSpeedTick}
              tickLine={false}
              axisLine={false}
            />
          </ComposedChart>
        </div>
        <div
          ref={wrapRef}
          className="h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* 组合图：同横轴（公里），左轴=每公里均速（柱状，蓝），右轴=每公里配速（折线，琥珀，越高越慢） */}
          <ComposedChart width={centerW} height={chartH} data={splits} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--separator)" />
            <XAxis
              dataKey="index"
              interval={0}
              height={20}
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              /* 格位过窄时隔一显示公里数，避免数字重叠 */
              tickFormatter={(v: number) => (cell >= 11 || v % 2 === 1 ? String(v) : '')}
            />
            {/* 隐藏纵轴：仅承载域定义（hide 轴不占位，绘图区占满中间列） */}
            <YAxis yAxisId="speed" width={SPEED_AXIS_W} hide domain={speedDomain} ticks={speedTicks} />
            <YAxis yAxisId="pace" width={PACE_AXIS_W} hide domain={paceDomain} ticks={paceTicks} />
            <Tooltip cursor={{ fill: 'var(--surface-secondary)' }} isAnimationActive={false} content={renderSplitTooltip} />
            <Bar
              yAxisId="speed"
              dataKey="avg_speed_kmh"
              radius={2}
              isAnimationActive={false}
              barSize={Math.max(2, Math.min(cell - 3, cell * 0.5))}
            >
              {splits.map((s) => (
                <Cell
                  key={s.index}
                  fill="var(--accent)"
                  fillOpacity={
                    s.avg_speed_kmh != null && Number.isFinite(s.avg_speed_kmh)
                      ? speedOpacity(s.avg_speed_kmh, minSpeed, maxSpeed)
                      : 0.35
                  }
                />
              ))}
            </Bar>
            <Line
              yAxisId="pace"
              dataKey="pace_s_per_km"
              type="monotone"
              stroke={PACE_LINE_COLOR}
              strokeWidth={1.8}
              dot={{ r: 2, fill: PACE_LINE_COLOR, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </div>
        <div className="h-full shrink-0" style={{ width: PACE_AXIS_W }}>
          <ComposedChart width={PACE_AXIS_W} height={chartH} data={splits} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            {blankX}
            <Line yAxisId="pace" dataKey="pace_s_per_km" hide />
            <YAxis
              yAxisId="pace"
              orientation="right"
              width={PACE_AXIS_W}
              domain={paceDomain}
              ticks={paceTicks}
              tick={renderPaceTick}
              tickLine={false}
              axisLine={false}
            />
          </ComposedChart>
        </div>
      </div>
    </div>
  )
}
