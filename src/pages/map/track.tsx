// 轨迹数据页：列表管理 + 导入（MinIO 存原始文件 + 前端解析）+ 详情（双底图轨迹渲染 + 指标时序分析）
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject, ReactNode } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownItemIndicator,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  EmptyState,
  Input,
  Label,
  SearchField,
  Spinner,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRoot,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
  toast,
} from '@heroui/react'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  FileUp,
  Layers,
  Mountain,
  MountainSnow,
  Play,
  RotateCcw,
  Route,
  Search,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Map } from '../../components/map'
import { AMap } from '../../components/amap'
import { useMapInstance } from '../../components/map/context'
import { useAMapInstance } from '../../components/amap/context'
import { TrackMlLayer } from '../../components/track/TrackMlLayer'
import { TrackAmapLayer } from '../../components/track/TrackAmapLayer'
import { SpeedLegend } from '../../components/track/SpeedLegend'
import { hasSpeedData, maxSpeedOf } from '../../components/track/speedColors'
import { SplitsChart, TrackChart, type ChartSeries } from '../../components/track/TrackChart'
import { deleteTracks, getTrackDetail, getTrackList, addTrack, type TrackListQuery } from '../../api/track'
import { parseTrackFile, geoJSONToPoints } from '../../lib/track/parse'
import { analyzeTrack } from '../../lib/track/metrics'
import { uploadTrackSource } from '../../lib/track/upload'
import { fmtDateTime, fmtDistance, fmtDuration, fmtEle, fmtPace, fmtSpeed, fmtTime } from '../../lib/track/format'
import { wgs84ToGcj02 } from '../../lib/geo'
import { hasPermission } from '../../stores/auth'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../components/ColumnSettings'
import PaginationBar from '../../components/PaginationBar'
import type { ParsedTrack, TrackPoint, TrackRow } from '../../types/track'

const PAGE_SIZE = 10

// 列设置：与文件管理 / 系统配置等页面保持同一交互（显隐 / 拖拽排序 / 固定列）
const TRACK_COLUMNS = [
  { key: 'track_name', label: '轨迹名称' },
  { key: 'track_type', label: '格式' },
  { key: 'distance_m', label: '总里程' },
  { key: 'duration_s', label: '总时长' },
  { key: 'avg_speed_kmh', label: '平均速度' },
  { key: 'max_speed_kmh', label: '最大速度' },
  { key: 'ascent_m', label: '累计爬升' },
  { key: 'point_count', label: '点数' },
  { key: 'start_time', label: '开始时间' },
  { key: 'end_time', label: '结束时间' },
  { key: 'create_time', label: '导入时间' },
  { key: 'actions', label: '操作' },
]
const TRACK_COLOR = '#3b82f6'
const SERIES_COLORS = { speed: '#3b82f6', pace: '#f59e0b', ele: '#10b981', cumdist: '#8b5cf6' }

interface Viewport {
  center: [number, number]
  zoom: number
  pitch: number
}

// ---- 视口同步：地图实例移动时写入共享 ref，底图切换时作为新图初始视口 ----

function MlViewSync({ viewportRef }: { viewportRef: RefObject<Viewport> }) {
  const map = useMapInstance()
  useEffect(() => {
    const sync = () => {
      const c = map.getCenter()
      viewportRef.current = { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch() }
    }
    map.on('move', sync)
    return () => {
      map.off('move', sync)
    }
  }, [map, viewportRef])
  return null
}

function AmapViewSync({ viewportRef }: { viewportRef: RefObject<Viewport> }) {
  const map = useAMapInstance()
  useEffect(() => {
    const sync = () => {
      const c = map.getCenter()
      viewportRef.current = {
        center: [c.getLng(), c.getLat()],
        zoom: map.getZoom(),
        pitch: map.getPitch() ?? 0,
      }
    }
    map.on('moveend' as never, sync)
    map.on('zoomchange' as never, sync)
    return () => {
      map.off('moveend' as never, sync)
      map.off('zoomchange' as never, sync)
    }
  }, [map, viewportRef])
  return null
}

// ---- 逐点信息弹窗内容 ----

function PointInfo({ point }: { point: TrackPoint }) {
  return (
    <div className="w-44 text-xs">
      <p className="mb-1 text-[13px] font-semibold text-foreground">轨迹点详情</p>
      <p className="flex justify-between text-muted">
        时间 <span className="font-medium text-foreground">{fmtTime(point.time)}</span>
      </p>
      <p className="flex justify-between text-muted">
        里程 <span className="font-medium text-foreground">{fmtDistance(point.dist_m)}</span>
      </p>
      <p className="flex justify-between text-muted">
        海拔 <span className="font-medium text-foreground">{fmtEle(point.ele)}</span>
      </p>
      <p className="flex justify-between text-muted">
        速度 <span className="font-medium text-foreground">{fmtSpeed(point.speed_kmh)}</span>
      </p>
    </div>
  )
}

// ---- 表格单元格：单行省略，截断时悬浮显示完整内容 ----

function EllipsisText({ text, className }: { text: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (el) setTruncated(el.scrollWidth > el.clientWidth + 1)
  }, [text])
  const span = <span ref={ref} className={`block truncate ${className ?? ''}`}>{text}</span>
  if (!truncated) return span
  return (
    <Tooltip>
      <TooltipTrigger>{span}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

// ---- 指标卡片 ----

/** 底图切换控件：置于右下角地图控件组，与官方控件同样式（28px 圆形浅灰按钮） */
function BasemapToggleControl({
  value,
  onChange,
}: {
  value: 'ml' | 'amap'
  onChange: (v: 'ml' | 'amap') => void
}) {
  return (
    <Dropdown>
      <Tooltip>
        <TooltipTrigger>
          <DropdownTrigger>
            <Button
              isIconOnly
              aria-label="切换底图"
              className="size-7! min-w-7! rounded-full! p-0! border! border-separator! bg-default! text-foreground! shadow-sm! hover:bg-(--default-hover)!"
            >
              <Layers size={14} aria-hidden />
            </Button>
          </DropdownTrigger>
        </TooltipTrigger>
        <TooltipContent>切换底图</TooltipContent>
      </Tooltip>
      <DropdownPopover placement="left top" className="min-w-[120px]">
        <DropdownMenu
          aria-label="底图"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([value])}
          onSelectionChange={(keys) => {
            if (keys === 'all') return
            const key = [...keys][0]
            if (key != null) onChange(key as 'ml' | 'amap')
          }}
        >
          <DropdownItem key="ml" id="ml" textValue="开源底图">
            <DropdownItemIndicator />
            <Label>开源底图</Label>
          </DropdownItem>
          <DropdownItem key="amap" id="amap" textValue="高德底图">
            <DropdownItemIndicator />
            <Label>高德底图</Label>
          </DropdownItem>
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  )
}


function MetricCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/50 bg-white/35 px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-white/10">
      <p className="flex items-center gap-1 text-[11px] leading-4 text-muted">
        {icon ? <span className="shrink-0 text-accent">{icon}</span> : null}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold leading-5 text-foreground">{value}</p>
      {hint ? <p className="truncate text-[10px] leading-3.5 text-muted">{hint}</p> : null}
    </div>
  )
}

// ---- 详情视图 ----

interface DetailProps {
  row: TrackRow
  onBack: () => void
}

function TrackDetailView({ row, onBack }: DetailProps) {
  const [basemap, setBasemap] = useState<'ml' | 'amap'>('ml')
  // 开源底图（MapLibre）的标注语言；仅 ml 底图生效，切回高德后重挂载时重新应用
  const [language, setLanguage] = useState('zh')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [splitsView, setSplitsView] = useState<'chart' | 'table'>('chart')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [xKind, setXKind] = useState<'time' | 'distance'>('time')
  const [metric, setMetric] = useState<'speed' | 'pace' | 'ele' | 'cumdist'>('speed')
  const [panelOpen, setPanelOpen] = useState(false)
  const viewportRef = useRef<Viewport>({ center: [104.2, 35.9], zoom: 4, pitch: 0 })

  const { data: detail, isPending } = useQuery({
    queryKey: ['track-detail', row.track_id],
    queryFn: () => getTrackDetail(row.track_id),
  })

  const points = useMemo(() => (detail ? extractPoints(detail) : []), [detail])
  const analysis = useMemo(() => {
    if (points.length === 0) return null
    return analyzeTrack(points, detectDims(points))
  }, [points])

  const dims = analysis?.dims ?? { time: false, ele: false, speed: false }
  const activePoint = activeIndex != null ? points[activeIndex] ?? null : null

  // 速度筛选上下限（km/h）：轨迹变化时重置为全区间 [0, 色标上限]；无速度数据为 null（不显示图例）
  const hasSpeed = hasSpeedData(points)
  const [speedRange, setSpeedRange] = useState<[number, number] | null>(null)
  useEffect(() => {
    setSpeedRange(hasSpeed ? [0, maxSpeedOf(points)] : null)
  }, [points, hasSpeed])

  // X 轴：优先时间，无时间数据回退距离
  const effectiveXKind = dims.time ? xKind : 'distance'
  const xValues = useMemo(() => {
    if (!analysis) return []
    return effectiveXKind === 'time' && analysis.series.cum_times
      ? analysis.series.cum_times
      : analysis.series.dists
  }, [analysis, effectiveXKind])

  // 指标 tab 选项（按可用维度过滤）
  const metricTabs = useMemo(() => {
    const tabs: { key: typeof metric; label: string; enabled: boolean }[] = [
      { key: 'speed', label: '速度', enabled: dims.speed },
      { key: 'pace', label: '配速', enabled: dims.speed },
      { key: 'ele', label: '海拔', enabled: dims.ele },
      { key: 'cumdist', label: '累计里程', enabled: points.length > 1 },
    ]
    return tabs
  }, [dims, points.length])

  const curMetric = metricTabs.find((t) => t.key === metric && t.enabled) ? metric : (metricTabs.find((t) => t.enabled)?.key ?? 'cumdist')

  const series: ChartSeries[] = useMemo(() => {
    if (!analysis) return []
    const s = analysis.series
    if (curMetric === 'speed') {
      return [{ key: 'speed', label: '速度', color: SERIES_COLORS.speed, unit: 'km/h', values: s.speeds ?? [] }]
    }
    if (curMetric === 'pace') {
      // 配速 = 3600/速度(km/h) 秒/公里；速度过低（停靠）不绘制
      const values = (s.speeds ?? []).map((v) => (v != null && v >= 0.5 ? 3600 / v : null))
      return [{ key: 'pace', label: '配速', color: SERIES_COLORS.pace, unit: 'min/km', values }]
    }
    if (curMetric === 'ele') {
      return [{ key: 'ele', label: '海拔', color: SERIES_COLORS.ele, unit: 'm', values: s.eles ?? [] }]
    }
    return [{ key: 'cumdist', label: '累计里程', color: SERIES_COLORS.cumdist, unit: 'm', values: s.dists }]
  }, [analysis, curMetric])

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    // data-fullscreen-root：全屏控件以此为全屏目标，返回按钮/轨迹分析/右下角控件随地图一起全屏
    <div data-fullscreen-root className="relative h-full min-h-0 overflow-hidden rounded-2xl">
      {/* 地图铺满整个内容区域 */}
      <div className="absolute inset-0">
        {basemap === 'ml' ? (
          <Map
            center={viewportRef.current.center}
            zoom={viewportRef.current.zoom}
            pitch={viewportRef.current.pitch}
            keepStyleInFullscreen
            language={language}
          >
            <MlViewSync viewportRef={viewportRef} />
            <TrackMlLayer
              points={points}
              color={TRACK_COLOR}
              activeIndex={activeIndex}
              hoverIndex={hoverIndex}
              onPointClick={setActiveIndex}
              onMapClick={() => setActiveIndex(null)}
              fit
              speedRange={speedRange}
            />
            {activePoint ? (
              <Map.Popup
                latitude={activePoint.lat}
                longitude={activePoint.lng}
                onClose={() => setActiveIndex(null)}
              >
                <PointInfo point={activePoint} />
              </Map.Popup>
            ) : null}
            <Map.Controls position="bottom-right">
              <Map.ZoomControl />
              <Map.LanguageControl value={language} onChange={setLanguage} />
              <Map.FullscreenControl />
              <BasemapToggleControl value={basemap} onChange={setBasemap} />
            </Map.Controls>
          </Map>
        ) : (
          <AMap center={viewportRef.current.center} zoom={viewportRef.current.zoom} pitch={viewportRef.current.pitch}>
            <AmapViewSync viewportRef={viewportRef} />
            <TrackAmapLayer
              points={points}
              color={TRACK_COLOR}
              activeIndex={activeIndex}
              hoverIndex={hoverIndex}
              onPointClick={setActiveIndex}
              onMapClick={() => setActiveIndex(null)}
              fit
              speedRange={speedRange}
            />
            {activePoint ? (
              <AmapInfoWrapper point={activePoint} onClose={() => setActiveIndex(null)} />
            ) : null}
            <AMap.Controls position="bottom-right">
              <BasemapToggleControl value={basemap} onChange={setBasemap} />
            </AMap.Controls>
          </AMap>
        )}
      </div>

      {/* 速度比例尺图例（左下角）：色带 + 双滑块调节上下限筛选轨迹段；
          轨迹分析面板展开时隐藏图例（避免浮在面板上方），折叠面板即可继续筛选 */}
      {speedRange && !panelOpen ? <SpeedLegend points={points} range={speedRange} onChange={setSpeedRange} /> : null}

      {/* 返回按钮（浮动在地图左上角） */}
      <Button
        variant="tertiary"
        size="sm"
        isIconOnly
        className="absolute left-3 top-3 z-20 rounded-full! border border-separator bg-surface/90 shadow-md backdrop-blur"
        onPress={onBack}
        aria-label="返回列表"
      >
        <ArrowLeft size={14} aria-hidden />
      </Button>

      {/* 底部轨迹分析抽屉：从下弹出 */}
      {analysis ? (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center overflow-hidden rounded-2xl transform transition-transform duration-300 ease-out ${
            panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)]'
          }`}
        >
          <div
            className={`pointer-events-auto rounded-2xl border border-white/40 bg-white/15 shadow-2xl backdrop-blur-2xl backdrop-saturate-150 transition-[width] duration-300 dark:border-white/10 dark:bg-black/35 [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.4),0_8px_32px_rgba(0,0,0,0.15)] ${
              panelOpen ? 'w-full' : 'w-fit max-w-[92%]'
            }`}
          >
            {/* 抽屉把手：折叠时显示摘要 */}
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="flex w-full items-center gap-3 whitespace-nowrap px-4 py-3 text-left"
              aria-expanded={panelOpen}
            >
              <BarChart3 size={15} className="shrink-0 text-accent" aria-hidden />
              <span className="text-[13px] font-semibold text-foreground">轨迹分析</span>
              {!panelOpen ? (
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium text-foreground">
                  <span>{fmtDistance(analysis.distance_m)}</span>
                  <span>{fmtDuration(analysis.duration_s)}</span>
                  <span>{fmtSpeed(analysis.avg_speed_kmh)}</span>
                </span>
              ) : null}
              <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-white/30 text-muted dark:bg-white/10">
                {panelOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
              </span>
            </button>

            {/* 抽屉内容：展开时向下撑开、内部滚动；折叠时高度与宽度同时收为 0，不参与卡片宽度计算 */}
            <div
              className="overflow-y-auto overflow-x-hidden border-t border-separator transition-[max-height,width] duration-300 ease-out"
              style={{ maxHeight: panelOpen ? 'min(76vh, 620px)' : 0, width: panelOpen ? '100%' : 0 }}
              aria-hidden={!panelOpen}
            >
              <div className="flex flex-col gap-3 px-4 py-3 pb-4">
                {/* 指标卡片 */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <MetricCard label="总里程" icon={<Route size={12} aria-hidden />} value={fmtDistance(analysis.distance_m)} hint={`${analysis.point_count} 个轨迹点`} />
                  <MetricCard label="总时长" icon={<Clock size={12} aria-hidden />} value={fmtDuration(analysis.duration_s)} />
                  <MetricCard label="移动时长" icon={<Timer size={12} aria-hidden />} value={fmtDuration(analysis.moving_s)} hint={`停靠 ${fmtDuration(analysis.duration_s - analysis.moving_s)}`} />
                  <MetricCard label="平均速度" icon={<Activity size={12} aria-hidden />} value={fmtSpeed(analysis.avg_speed_kmh)} hint="按移动时长计算" />
                  <MetricCard label="最大速度" icon={<Zap size={12} aria-hidden />} value={fmtSpeed(analysis.max_speed_kmh)} />
                  <MetricCard
                    label="起止时间"
                    icon={<CalendarClock size={12} aria-hidden />}
                    value={<span className="text-[13px]">{fmtTime(firstTime(points))} — {fmtTime(lastTime(points))}</span>}
                    hint={points[0] ? fmtDateTime(points[0].time) : undefined}
                  />
                  <MetricCard label="累计爬升" icon={<TrendingUp size={12} aria-hidden />} value={<span className="text-success">↑ {analysis.ascent_m} m</span>} />
                  <MetricCard label="累计下降" icon={<TrendingDown size={12} aria-hidden />} value={<span className="text-danger">↓ {analysis.descent_m} m</span>} />
                  <MetricCard label="最高海拔" icon={<Mountain size={12} aria-hidden />} value={fmtEle(analysis.max_ele_m)} />
                  <MetricCard label="最低海拔" icon={<MountainSnow size={12} aria-hidden />} value={fmtEle(analysis.min_ele_m)} />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* 曲线图 */}
                  <div className="flex h-full flex-col rounded-2xl border border-white/45 bg-white/30 p-2 shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-white/10">
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      {metricTabs.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          disabled={!t.enabled}
                          onClick={() => setMetric(t.key)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            curMetric === t.key ? 'bg-accent-soft text-accent-soft-foreground' : 'text-muted/75 hover:text-foreground'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                      {dims.time ? (
                        <span className="ml-auto flex rounded-md border border-separator p-0.5">
                          {([['time', '按时间'], ['distance', '按距离']] as const).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setXKind(key)}
                              className={`rounded px-2 py-0.5 text-[11px] ${
                                effectiveXKind === key ? 'bg-accent-soft text-accent-soft-foreground' : 'text-muted'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative min-h-[140px] flex-1">
                      <TrackChart
                        xValues={xValues}
                        xKind={effectiveXKind}
                        timeOriginMs={firstTime(points) ?? undefined}
                        series={series}
                        activeIndex={activeIndex}
                        onHoverIndex={setHoverIndex}
                        height={140}
                      />
                    </div>
                  </div>

                  {/* 每公里分段（图表/表格切换，压缩高度） */}
                  <div className="flex h-full flex-col rounded-2xl border border-white/45 bg-white/30 p-2 shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-white/10">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted/75">每公里分段</span>
                      {/* 与左侧折线图卡片同款的 tab 按钮（text-xs font-medium + accent-soft 选中态） */}
                      <div className="flex items-center gap-1">
                        {(
                          [
                            ['chart', '柱状图'],
                            ['table', '表格'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSplitsView(key)}
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              splitsView === key
                                ? 'bg-accent-soft text-accent-soft-foreground'
                                : 'text-muted/75 hover:text-foreground'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {splitsView === 'chart' ? (
                      <div className="relative min-h-[120px] flex-1">
                        <SplitsChart splits={analysis.splits} height={120} />
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-white/30 dark:border-white/10">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10 text-muted">
                            <tr>
                              {/* 背景必须放在 th 上（thead 上 backdrop-filter 不生效），且接近不透明才能盖住滚动行 */}
                              <th className="bg-white/95 px-2 py-1.5 text-left font-medium backdrop-blur-sm dark:bg-black/85">公里</th>
                              <th className="bg-white/95 px-2 py-1.5 text-left font-medium backdrop-blur-sm dark:bg-black/85">用时</th>
                              <th className="bg-white/95 px-2 py-1.5 text-left font-medium backdrop-blur-sm dark:bg-black/85">均速</th>
                              <th className="bg-white/95 px-2 py-1.5 text-left font-medium backdrop-blur-sm dark:bg-black/85">配速</th>
                              <th className="bg-white/95 px-2 py-1.5 text-left font-medium backdrop-blur-sm dark:bg-black/85">爬升</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.splits.map((s) => (
                              <tr key={s.index} className="border-t border-separator/60 hover:bg-surface-secondary">
                                <td className="px-2 py-1.5 font-medium text-foreground">{s.index}</td>
                                <td className="px-2 py-1.5">{fmtDuration(s.duration_s)}</td>
                                <td className="px-2 py-1.5">{s.avg_speed_kmh.toFixed(1)} km/h</td>
                                <td className="px-2 py-1.5">{fmtPace(s.pace_s_per_km)}/km</td>
                                <td className="px-2 py-1.5">{s.ascent_m} m</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// AMap InfoWindow 包装（GCJ-02 定位）
function AmapInfoWrapper({ point, onClose }: { point: TrackPoint; onClose: () => void }) {
  const gcj = wgs84ToGcj02(point.lng, point.lat)
  return (
    <AMap.InfoWindow longitude={gcj[0]} latitude={gcj[1]} onClose={onClose}>
      <PointInfo point={point} />
    </AMap.InfoWindow>
  )
}

// ---- 数据提取工具 ----

function extractPoints(detail: { geojson: Parameters<typeof geoJSONToPoints>[0] }): TrackPoint[] {
  return geoJSONToPoints(detail.geojson)
}

function detectDims(points: TrackPoint[]) {
  return {
    time: points.some((p) => p.time != null),
    ele: points.some((p) => p.ele != null),
    speed: points.some((p) => p.speed_kmh != null),
  }
}

function firstTime(points: TrackPoint[]): number | null {
  return points[0]?.time ?? null
}

function lastTime(points: TrackPoint[]): number | null {
  return points[points.length - 1]?.time ?? null
}

// ---- 页面主体：列表 / 详情切换 ----

export default function TrackPage() {
  const [query, setQuery] = useState<TrackListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [nameInput, setNameInput] = useState('')
  const [detailRow, setDetailRow] = useState<TrackRow | null>(null)
  const [deleting, setDeleting] = useState<TrackRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const queryClient = useQueryClient()

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'track-table-cols', columns: TRACK_COLUMNS, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['track-list', query],
    queryFn: () => getTrackList(query),
    placeholderData: keepPreviousData,
  })
  const rows = useMemo(() => data?.rows ?? [], [data])
  const pageSize = query.pageSize ?? PAGE_SIZE

  const search = () => setQuery((q) => ({ ...q, pageNum: 1, trackName: nameInput || undefined }))

  /** 按列 key 渲染单元格内容（配合列设置的显隐/排序） */
  const renderCell = (row: TrackRow, key: string) => {
    switch (key) {
      case 'track_name':
        return (
          <button
            type="button"
            className="max-w-[220px] text-left font-medium text-accent hover:underline"
            onClick={() => setDetailRow(row)}
          >
            <EllipsisText text={row.track_name} />
          </button>
        )
      case 'track_type':
        return (
          <Chip size="sm" variant="soft">
            {typeLabel(row.track_type)}
          </Chip>
        )
      case 'distance_m':
        return fmtDistance(row.distance_m)
      case 'duration_s':
        return fmtDuration(row.duration_s)
      case 'avg_speed_kmh':
        return fmtSpeed(row.avg_speed_kmh)
      case 'max_speed_kmh':
        return fmtSpeed(row.max_speed_kmh)
      case 'ascent_m':
        return `${row.ascent_m} m`
      case 'point_count':
        return row.point_count
      case 'start_time':
        return (
          <EllipsisText text={row.start_time ? row.start_time.replace('T', ' ').slice(0, 19) : '—'} />
        )
      case 'end_time':
        return (
          <EllipsisText text={row.end_time ? row.end_time.replace('T', ' ').slice(0, 19) : '—'} />
        )
      case 'create_time':
        return (
          <EllipsisText text={row.create_time ? row.create_time.replace('T', ' ').slice(0, 19) : '—'} />
        )
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  size="sm"
                  variant="tertiary"
                  isIconOnly
                  className="rounded-full!"
                  onPress={() => setDetailRow(row)}
                  aria-label="查看"
                >
                  <Play size={12} className="size-3!" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看分析</TooltipContent>
            </Tooltip>
            {hasPermission('track:track:remove') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => setDeleting(row)}
                    aria-label="删除"
                  >
                    <Trash2 size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>删除</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      default:
        return null
    }
  }

  const handleDelete = async (row: TrackRow) => {
    try {
      await deleteTracks([row.track_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    void queryClient.invalidateQueries({ queryKey: ['track-list'] })
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    try {
      await deleteTracks(selectedIds)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelectedIds([])
    void queryClient.invalidateQueries({ queryKey: ['track-list'] })
  }

  const typeLabel = (t: string | null | undefined) => (t ? t.toUpperCase() : '—')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {detailRow ? (
        <TrackDetailView row={detailRow} onBack={() => setDetailRow(null)} />
      ) : (
        <>
          {/* 工具栏 */}
          <div className="flex flex-wrap items-end gap-3 border-b border-separator pb-4">
            <SearchField
              aria-label="按轨迹名称搜索"
              value={nameInput}
              onChange={setNameInput}
              onSubmit={search}
              className="w-56"
            >
              <Label className="text-xs font-medium text-muted">轨迹名称</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="回车搜索" className="text-xs!" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={search}
            >
              <Search size={12} className="size-3!" aria-hidden />
              搜索
            </Button>
            <Button variant="tertiary" size="sm" onPress={() => { setNameInput(''); setQuery({ pageNum: 1, pageSize: PAGE_SIZE }) }}>
              <RotateCcw size={12} className="size-3!" aria-hidden />
              重置
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {hasPermission('track:track:add') && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
                  onPress={() => setImportOpen(true)}
                >
                  <FileUp size={12} className="size-3!" aria-hidden />
                  导入轨迹
                </Button>
              )}
              {hasPermission('track:track:remove') && (
                <Button
                  variant="danger-soft"
                  size="sm"
                  isDisabled={selectedIds.length === 0}
                  onPress={handleBatchDelete}
                >
                  <Trash2 size={12} className="size-3!" aria-hidden />
                  批量删除{selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}
                </Button>
              )}
              <ColumnSettings ctrl={colCtrl} />
            </div>
          </div>

          {/* 列表 */}
          <div ref={tableAreaRef} className="flex min-h-0 flex-col">
            <TableRoot className="flex! min-h-0 flex-col shadow-sm">
              <TableScrollContainer className="min-h-0 flex-1 overflow-auto rounded-2xl">
                <TableContent aria-label="轨迹数据列表" className="min-w-[980px]">
                  <TableHeader className="sticky top-0 z-20 bg-surface-secondary">
                    {visibleColumns.map((col) => {
                      const sticky = stickyColProps(col.key, true)
                      const merged = `whitespace-nowrap ${'className' in sticky ? sticky.className : ''}`
                      return (
                        <TableColumn
                          key={col.key}
                          id={col.key}
                          isRowHeader={col.key === visibleColumns[0].key}
                          {...sticky}
                          className={merged}
                        >
                          {col.label}
                        </TableColumn>
                      )
                    })}
                  </TableHeader>
                  <TableBody
                    items={rows.map((r) => ({ ...r, id: r.track_id }))}
                    dependencies={[visibleColumns]}
                    renderEmptyState={() =>
                      isPending ? (
                        <Spinner />
                      ) : (
                        <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                          <Play size={20} aria-hidden className="text-muted" />
                          <Typography.Paragraph size="sm" color="muted">
                            暂无轨迹数据，点击右上角「导入轨迹」上传 GPX / KML / KMZ 文件
                          </Typography.Paragraph>
                        </EmptyState>
                      )
                    }
                  >
                    {(row) => (
                      <TableRow id={row.id} className="whitespace-nowrap">
                        {visibleColumns.map((col) => (
                          <TableCell key={col.key} {...stickyColProps(col.key, false)}>
                            {renderCell(row, col.key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </TableContent>
              </TableScrollContainer>
            </TableRoot>
          </div>

          {/* 分页（公共组件，与其他列表页统一） */}
          <PaginationBar
            total={data?.total ?? 0}
            pageNum={query.pageNum ?? 1}
            pageSize={pageSize}
            onChange={(patch) => setQuery((q) => ({ ...q, ...patch }))}
          />

          <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />

          {/* 删除确认 */}
          {deleting ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleting(null)}>
              <div className="w-80 rounded-xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-semibold text-foreground">删除轨迹？</p>
                <p className="mt-1 text-xs text-muted">确定删除轨迹「{deleting.track_name}」吗？该操作不可撤销。</p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="tertiary" size="sm" onPress={() => setDeleting(null)}>取消</Button>
                  <Button variant="danger" size="sm" onPress={() => handleDelete(deleting)}>删除</Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ---- 导入弹窗 ----

function ImportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedTrack | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [uploadPct, setUploadPct] = useState(0)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const analysis = useMemo(() => (parsed ? analyzeTrack(parsed.points, parsed.dims) : null), [parsed])

  if (!isOpen) return null

  // 关闭时清空全部弹窗状态：组件常挂载（isOpen 仅控制渲染），不重置会残留上次导入的文件/预览/进度
  const handleClose = () => {
    setFile(null)
    setParsed(null)
    setParsing(false)
    setParseError(null)
    setName('')
    setUploadPct(0)
    setSaving(false)
    onClose()
  }

  const pickFile = async (f: File | null) => {
    setParsed(null)
    setParseError(null)
    setUploadPct(0)
    setFile(f)
    if (!f) return
    setParsing(true)
    try {
      const result = await parseTrackFile(f)
      setParsed(result)
      setName(result.name)
    } catch (e) {
      setParseError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const save = async () => {
    if (!parsed || !file || !name.trim()) return
    setSaving(true)
    try {
      // 1. 原始文件上传 MinIO
      let fileId: number | null = null
      try {
        fileId = await uploadTrackSource(file, setUploadPct)
      } catch (e) {
        toast('原始文件上传失败', { description: (e as Error).message, variant: 'warning' })
      }
      // 2. 轨迹记录保存
      const points = parsed.points
      await addTrack({
        track_name: name.trim(),
        track_type: parsed.type,
        file_id: fileId,
        file_name: file.name,
        geojson: parsed.geojson,
        distance_m: analysis?.distance_m ?? 0,
        ascent_m: analysis?.ascent_m ?? 0,
        descent_m: analysis?.descent_m ?? 0,
        max_ele_m: analysis?.max_ele_m ?? null,
        min_ele_m: analysis?.min_ele_m ?? null,
        duration_s: analysis?.duration_s ?? 0,
        moving_s: analysis?.moving_s ?? 0,
        avg_speed_kmh: analysis?.avg_speed_kmh ?? 0,
        max_speed_kmh: analysis?.max_speed_kmh ?? 0,
        point_count: analysis?.point_count ?? points.length,
        start_time: points[0]?.time != null ? new Date(points[0].time).toISOString() : null,
        end_time: points[points.length - 1]?.time != null ? new Date(points[points.length - 1].time!).toISOString() : null,
      })
      toast('成功', { description: '轨迹导入成功', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['track-list'] })
      handleClose()
    } catch (e) {
      // 保存失败必须提示（此前静默吞错导致弹窗卡在"上传完成"状态无法定位原因）
      toast('轨迹保存失败', { description: (e as Error).message, variant: 'warning' })
      return
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && handleClose()}>
      <div className="w-[480px] rounded-2xl border border-separator bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-separator px-5 py-3.5">
          <p className="text-base font-semibold text-foreground">导入轨迹</p>
          <p className="mt-0.5 text-xs text-muted">支持 GPX / KML / KMZ 文件，解析预览后保存；原始文件同步存入 MinIO</p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <Label className="text-xs font-medium text-muted">轨迹文件</Label>
            <div
              className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-separator py-6 text-center hover:bg-surface-secondary"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void pickFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <FileUp size={20} className="text-muted" aria-hidden />
              {file ? (
                <p className="text-xs text-foreground">{file.name}（{(file.size / 1024).toFixed(1)} KB）</p>
              ) : (
                <p className="text-xs text-muted">点击选择或拖拽文件到此处</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,.kml,.kmz"
                className="hidden"
                onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {parsing ? <Spinner /> : null}
          {parseError ? <p className="text-xs text-danger">{parseError}</p> : null}

          {parsed && analysis ? (
            <>
              <div>
                <Label className="text-xs font-medium text-muted">轨迹名称</Label>
                <Input
                  aria-label="轨迹名称"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  className="mt-1 h-8! text-xs!"
                />
              </div>
              {!parsed.dims.time || !parsed.dims.ele ? (
                <p className="text-[11px] text-warning-soft-foreground">
                  提示：{!parsed.dims.time ? '文件无时间数据（速度/配速/分段不可用）' : ''}
                  {!parsed.dims.time && !parsed.dims.ele ? '；' : ''}
                  {!parsed.dims.ele ? '文件无海拔数据（海拔指标不可用）' : ''}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-secondary p-3 text-xs">
                <div>
                  <p className="text-muted">总里程</p>
                  <p className="font-semibold text-foreground">{fmtDistance(analysis.distance_m)}</p>
                </div>
                <div>
                  <p className="text-muted">总时长</p>
                  <p className="font-semibold text-foreground">{fmtDuration(analysis.duration_s)}</p>
                </div>
                <div>
                  <p className="text-muted">平均速度</p>
                  <p className="font-semibold text-foreground">{fmtSpeed(analysis.avg_speed_kmh)}</p>
                </div>
                <div>
                  <p className="text-muted">累计爬升</p>
                  <p className="font-semibold text-foreground">{analysis.ascent_m} m</p>
                </div>
                <div>
                  <p className="text-muted">累计下降</p>
                  <p className="font-semibold text-foreground">{analysis.descent_m} m</p>
                </div>
                <div>
                  <p className="text-muted">轨迹点数</p>
                  <p className="font-semibold text-foreground">{analysis.point_count}</p>
                </div>
              </div>
            </>
          ) : null}

          {saving || uploadPct > 0 ? (
            <div>
              <p className="mb-1 text-xs text-muted">{saving ? `上传原始文件 ${uploadPct}%` : '上传完成'}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-separator px-5 py-3.5">
          <Button variant="tertiary" size="sm" onPress={handleClose} isDisabled={saving}>
            取消
          </Button>
          <Button variant="primary" size="sm" isPending={saving} isDisabled={!parsed || !name.trim()} onPress={() => void save()}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
