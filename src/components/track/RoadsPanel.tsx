// 路段分析面板：OSM 路段解析结果的统计看板（指标卡 + 类型分布图 + 逐路段均速图 + 明细表）
// 结构与轨迹分析抽屉同款：玻璃卡片 + Recharts 小图（v3 坑：dataKey 只读行顶层，数值平铺在行顶层）
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { YAxisTickContentProps } from 'recharts'
import { Route as RouteIcon, Activity, Gauge, Layers } from 'lucide-react'
import { fmtDistance } from '../../lib/track/format'
import type { TrackRoadRow } from '../../types/track'

// ---- 道路等级中文映射与配色 ----

const CLS_META: Record<string, { label: string; color: string }> = {
  motorway: { label: '高速公路', color: '#2563eb' },
  motorway_link: { label: '高速匝道', color: '#60a5fa' },
  trunk: { label: '快速路', color: '#0ea5e9' },
  trunk_link: { label: '快速路匝道', color: '#38bdf8' },
  primary: { label: '主干路', color: '#f59e0b' },
  primary_link: { label: '主干路匝道', color: '#fbbf24' },
  secondary: { label: '次干路', color: '#10b981' },
  secondary_link: { label: '次干路匝道', color: '#34d399' },
  tertiary: { label: '支路', color: '#8b5cf6' },
  tertiary_link: { label: '支路匝道', color: '#a78bfa' },
  residential: { label: '居住区道路', color: '#64748b' },
  service: { label: '内部道路', color: '#94a3b8' },
  unclassified: { label: '一般道路', color: '#6b7280' },
  road: { label: '一般道路', color: '#6b7280' },
  minor: { label: '一般道路', color: '#6b7280' },
  minor_link: { label: '一般道路匝道', color: '#9ca3af' },
  minor_construction: { label: '在建道路', color: '#d97706' },
  rail: { label: '铁路', color: '#78716c' },
  transit: { label: '轨道交通', color: '#a8a29e' },
  raceway: { label: '赛道', color: '#ec4899' },
  track: { label: '田间道', color: '#a16207' },
  pedestrian: { label: '步行街', color: '#84cc16' },
  footway: { label: '步道', color: '#84cc16' },
  path: { label: '小径', color: '#65a30d' },
  cycleway: { label: '自行车道', color: '#22c55e' },
  steps: { label: '台阶', color: '#78716c' },
  living_street: { label: '生活性街道', color: '#71717a' },
}
const CLS_FALLBACK = { label: '其他', color: '#9ca3af' }
const clsMeta = (cls: string) => CLS_META[cls] ?? CLS_FALLBACK

const SURFACE_LABEL: Record<string, string> = {
  paved: '铺装', asphalt: '沥青', concrete: '混凝土', 'concrete:lanes': '混凝土车道',
  chipseal: '碎石封层', unpaved: '非铺装', gravel: '碎石',
  fine_gravel: '细砾石', compacted: '压实', dirt: '土路', ground: '地面',
  sand: '沙地', mud: '泥地', grass: '草地', wood: '木面', metal: '金属',
  paving_stones: '铺路石', sett: '方块石', cobblestone: '鹅卵石',
}
const surfaceLabel = (s: string | null | undefined) => (s ? SURFACE_LABEL[s] ?? s : '—')

const BRUNNEL_LABEL: Record<string, string> = { bridge: '桥', tunnel: '隧道', ford: '涉水' }

// OSM maxspeed 原始值 → 数字 km/h（"60"/"60 knots" 等仅取常见数字形式，解析失败返回 null）
function parseMaxspeed(v: string | null | undefined): number | null {
  if (!v) return null
  const m = /^(\d+(?:\.\d+)?)\b/.exec(v.trim())
  return m ? Number(m[1]) : null
}

const fmtKm = (m: number) => `${parseFloat((m / 1000).toFixed(2))} km`

// ---- 指标卡（与轨迹分析的 MetricCard 同款样式） ----

function RoadMetricCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-separator bg-surface px-3 py-1.5">
      <p className="flex items-center gap-1 text-[11px] leading-4 text-muted">
        {icon ? <span className="shrink-0 text-accent">{icon}</span> : null}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold leading-5 text-foreground">{value}</p>
      {hint ? <p className="truncate text-[10px] leading-3.5 text-muted">{hint}</p> : null}
    </div>
  )
}

// ---- 图表通用 ----

const AX_TICK = { fontSize: 10, fill: 'var(--muted)' } as const

// Y 轴刻度只显数值（单位在卡片标题标注），单行渲染绕 Recharts 内置 Text 强制折行
const renderSpeedTick = ({ x, y, payload }: YAxisTickContentProps) => (
  <text x={Number(x)} y={Number(y) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
    {String(Math.round(Number(payload.value)))}
  </text>
)

// ---- 类型分布图：按道路等级的匹配里程横向条形图 ----

interface ClsDistRow { cls: string; label: string; color: string; km: number }

function ClsDistChart({ segments }: { segments: TrackRoadRow[] }) {
  const rows = useMemo<ClsDistRow[]>(() => {
    const byCls = new Map<string, number>()
    for (const s of segments) {
      byCls.set(s.road_cls, (byCls.get(s.road_cls) ?? 0) + (s.dist_e - s.dist_s))
    }
    return [...byCls.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cls, dist]) => ({
        cls,
        ...(cls === '' ? { label: '未匹配路段', color: '#9ca3af' } : clsMeta(cls)),
        km: dist / 1000,
      }))
  }, [segments])

  if (rows.length === 0) return <p className="py-8 text-center text-xs text-muted">暂无路段数据</p>

  return (
    <div className="absolute inset-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--separator)" />
          <XAxis
            type="number"
            domain={[0, 'auto']}
            height={20}
            tick={AX_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${parseFloat(v.toFixed(1))} km`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={76}
            interval={0}
            tick={AX_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-secondary)' }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as ClsDistRow | undefined
              if (!active || !d) return null
              return (
                <div className="rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg">
                  <p className="font-medium text-foreground">{d.label}</p>
                  <p className="text-muted">
                    匹配里程 <span className="font-medium text-foreground">{fmtKm(d.km * 1000)}</span>
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="km" radius={2} barSize={10} isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.cls} fill={d.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---- 逐路段均速图：柱=区间均速（深浅按速度映射，与每公里分段图同款） ----

interface RoadSpeedRow {
  seq: number // 1 起
  name: string
  clsLabel: string
  unmatched: boolean
  lengthM: number
  spd: number | null
  maxspeedKmh: number | null
  surface: string
}

// 左轴固定、绘图区横向滚动（同每公里分段图三段式结构的单轴版）：
// 两侧显式 domain+ticks 保证刻度对齐；v3 坑=侧轴图须塞一个零尺寸绘制元素（Bar fill=transparent）轴才渲染
const SPEED_AXIS_W = 40
const ROADS_MIN_CELL = 10

function RoadsSpeedChart({ segments }: { segments: TrackRoadRow[] }) {
  const rows = useMemo<RoadSpeedRow[]>(
    () =>
      segments.map((s, i) => ({
        seq: i + 1,
        name: s.road_cls === '' ? '未匹配路段' : (s.name_zh ?? s.name ?? '未命名道路'),
        clsLabel: s.road_cls === '' ? '—' : clsMeta(s.road_cls).label,
        unmatched: s.road_cls === '',
        lengthM: s.dist_e - s.dist_s,
        spd: s.avg_spd != null && Number.isFinite(s.avg_spd) ? s.avg_spd : null,
        maxspeedKmh: parseMaxspeed(s.maxspeed),
        surface: surfaceLabel(s.surface),
      })),
    [segments],
  )

  const speeds = rows.map((r) => r.spd).filter((v): v is number => v != null)
  const minSpd = speeds.length ? Math.min(...speeds) : 0
  const maxSpd = speeds.length ? Math.max(...speeds) : 1
  // 均速轴：0 起整数步长（刻度 0/step/2*step，与左轴图显式对齐）
  const step = Math.max(1, Math.ceil((speeds.length ? Math.max(...speeds) : 1) / 2))
  const speedDomain = [0, step * 2] as [number, number]
  const speedTicks = [0, step, step * 2]

  // 宽高由父级（h-[150px] 容器）决定；绘图区超出容器宽时横向滚动
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

  const centerW = Math.max(wrapW, rows.length * ROADS_MIN_CELL)
  const cell = centerW / Math.max(1, rows.length)
  const chartH = wrapH || 150
  // 侧轴图的空白 XAxis：只为占住与中间图相同的高度（hide 轴不占高，实测会让刻度上移错位）
  const blankX = <XAxis dataKey="seq" height={20} interval={0} tick={false} tickLine={false} axisLine={false} />

  if (rows.length === 0) return <p className="py-8 text-center text-xs text-muted">暂无路段数据</p>

  return (
    // 外层 relative 承载悬浮提示；中间列横向滚动并隐藏滚动条，左列固定
    <div className="absolute inset-0">
      <div className="flex h-full w-full">
        <div className="h-full shrink-0" style={{ width: SPEED_AXIS_W }}>
          <ComposedChart width={SPEED_AXIS_W} height={chartH} data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            {blankX}
            <Bar yAxisId="speed" dataKey="spd" fill="transparent" />
            <YAxis
              yAxisId="speed"
              orientation="left"
              width={SPEED_AXIS_W}
              interval={0}
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
          <ComposedChart width={centerW} height={chartH} data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--separator)" />
            <XAxis
              dataKey="seq"
              interval={0}
              height={20}
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              /* 格位过窄时隔 5 显示段号，避免数字重叠 */
              tickFormatter={(v: number) => (cell >= 14 || v % 5 === 0 ? String(v) : '')}
            />
            {/* 隐藏纵轴：仅承载域定义（hide 轴不占位，绘图区占满中间列） */}
            <YAxis yAxisId="speed" width={SPEED_AXIS_W} hide domain={speedDomain} ticks={speedTicks} />
            <Tooltip
              cursor={{ fill: 'var(--surface-secondary)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as RoadSpeedRow | undefined
                if (!active || !r) return null
                return (
                  <div className="min-w-36 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-xs shadow-lg">
                    <p className="mb-0.5 font-medium text-foreground">
                      第 {r.seq} 段 · {r.name}
                    </p>
                    <p className="text-muted">
                      等级 <span className="font-medium text-foreground">{r.clsLabel}</span>
                      {' '}· 路面 <span className="font-medium text-foreground">{r.surface}</span>
                    </p>
                    <p className="text-muted">
                      长度 <span className="font-medium text-foreground">{fmtDistance(r.lengthM)}</span>
                    </p>
                    <p className="text-muted">
                      均速 <span className="font-medium text-foreground">{r.spd != null ? `${r.spd.toFixed(1)} km/h` : '—'}</span>
                      {r.maxspeedKmh != null ? (
                        <>
                          {' '}· 限速 <span className="font-medium text-foreground">{r.maxspeedKmh} km/h</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                )
              }}
            />
            <Bar yAxisId="speed" dataKey="spd" radius={2} isAnimationActive={false} barSize={Math.max(2, Math.min(cell - 3, cell * 0.5))}>
              {rows.map((r, i) => (
                <Cell
                  key={i}
                  fill={r.unmatched ? 'var(--muted)' : 'var(--accent)'}
                  fillOpacity={
                    r.spd != null && maxSpd > minSpd ? 0.35 + 0.6 * ((r.spd - minSpd) / (maxSpd - minSpd)) : 0.35
                  }
                />
              ))}
            </Bar>
          </ComposedChart>
        </div>
      </div>
    </div>
  )
}

// ---- 路段明细表 ----

function RoadsTable({ segments }: { segments: TrackRoadRow[] }) {
  return (
    // 内容放不下时横向滚动（隐藏滚动条），行内容一律单行不换行
    <div className="max-h-64 overflow-y-auto rounded-lg border border-separator [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5">
      <table className="w-max min-w-full whitespace-nowrap text-xs">
        <thead className="sticky top-0 z-10 text-muted">
          <tr>
            {/* 背景必须放在 th 上（thead 上 backdrop-filter 不生效），且接近不透明才能盖住滚动行 */}
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">序号</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">道路</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">编号</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">等级</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">路面</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-left font-medium">桥隧</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-right font-medium">长度（km）</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-right font-medium">均速（km/h）</th>
            <th className="bg-surface-secondary px-2 py-1.5 text-right font-medium">限速（km/h）</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s, i) => (
            <tr key={s.seq} className="border-t border-separator/60 hover:bg-surface-secondary">
              <td className="px-2 py-1.5 font-medium text-foreground">{i + 1}</td>
              <td
                className={`max-w-[180px] truncate px-2 py-1.5 ${s.road_cls === '' || (s.name_zh == null && s.name == null) ? 'italic text-muted' : ''}`}
                title={s.name_zh ?? s.name ?? undefined}
              >
                {s.road_cls === '' ? '未匹配路段' : (s.name_zh ?? s.name ?? '未命名道路')}
              </td>
              <td className="px-2 py-1.5">{s.ref ?? '—'}</td>
              <td className="px-2 py-1.5">{s.road_cls === '' ? '—' : clsMeta(s.road_cls).label}</td>
              <td className="px-2 py-1.5">{surfaceLabel(s.surface)}</td>
              <td className="px-2 py-1.5">{s.brunnel ? BRUNNEL_LABEL[s.brunnel] ?? s.brunnel : '—'}</td>
              <td className="px-2 py-1.5 text-right">{((s.dist_e - s.dist_s) / 1000).toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right">{s.avg_spd != null ? s.avg_spd.toFixed(1) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{parseMaxspeed(s.maxspeed) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- 面板主体 ----

export interface RoadsPanelProps {
  segments: TrackRoadRow[]
  matchedPct: number | null
}

export function RoadsPanel({ segments, matchedPct }: RoadsPanelProps) {
  const summary = useMemo(() => {
    const totalM = segments.length ? Math.max(...segments.map((s) => s.dist_e)) : 0
    const wSpd = segments.reduce((acc, s) => acc + (s.dist_e - s.dist_s) * (s.avg_spd ?? 0), 0)
    const avgSpd = totalM > 0 ? wSpd / totalM : null
    return { totalM, avgSpd }
  }, [segments])

  const clsCount = useMemo(() => new Set(segments.map((s) => s.road_cls)).size, [segments])

  return (
    <div className="flex flex-col gap-3 px-4 py-3 pb-4">
      {/* 指标卡片（右侧抽屉窄栏：2×2） */}
      <div className="grid grid-cols-2 gap-2">
        <RoadMetricCard label="路段总数" icon={<RouteIcon size={12} aria-hidden />} value={segments.length} hint={`${clsCount} 种道路等级`} />
        <RoadMetricCard label="匹配里程" icon={<Layers size={12} aria-hidden />} value={fmtKm(summary.totalM)} />
        <RoadMetricCard
          label="匹配率"
          icon={<Gauge size={12} aria-hidden />}
          value={matchedPct != null ? `${matchedPct.toFixed(1)}%` : '—'}
        />
        <RoadMetricCard
          label="平均区间均速"
          icon={<Activity size={12} aria-hidden />}
          value={summary.avgSpd != null ? `${summary.avgSpd.toFixed(1)} km/h` : '—'}
          hint="按路段里程加权"
        />
      </div>

      {/* 图表纵向堆叠（右侧抽屉窄栏） */}
      <div className="flex flex-col gap-4">
        {/* 类型分布 */}
        <div className="flex flex-col rounded-2xl border border-separator bg-surface p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted/75">道路等级里程分布</span>
          </div>
          <div className="relative h-[150px]">
            <ClsDistChart segments={segments} />
          </div>
        </div>

        {/* 逐路段均速 */}
        <div className="flex flex-col rounded-2xl border border-separator bg-surface p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted/75">逐路段均速（km/h）</span>
          </div>
          <div className="relative h-[150px]">
            <RoadsSpeedChart segments={segments} />
          </div>
        </div>
      </div>

      {/* 明细表 */}
      <div className="flex flex-col rounded-2xl border border-separator bg-surface p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted/75">路段明细（{segments.length} 段）</span>
        </div>
        <RoadsTable segments={segments} />
      </div>
    </div>
  )
}
