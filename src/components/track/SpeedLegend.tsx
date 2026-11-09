// 速度比例尺图例（左下角横排紧凑版）：细横向速度色带（绿→黄→红，与轨迹线取色一致）+ 双滑块调节上下限，
// 无静态文字，悬停/拖动时浮动提示对应速度值；调节后轨迹中超出范围的区段透明（筛选显示）。
// 滑块为自绘实现（原生 range 叠加层拖动不可靠），拖动中全局监听 pointermove 支持移出色带连续调节
import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { maxSpeedOf } from './speedColors'
import type { TrackPoint } from '../../types/track'

export interface SpeedLegendProps {
  points: TrackPoint[]
  /** 当前筛选上下限（km/h，绝对值） */
  range: [number, number]
  onChange: (range: [number, number]) => void
}

export function SpeedLegend({ points, range, onChange }: SpeedLegendProps) {
  // 色带轴向与轨迹线上色共用 maxSpeedOf，保证图例刻度与渐变色标一致
  const axisMax = Math.max(maxSpeedOf(points), 1)
  const [lo, hi] = range
  const modified = lo > 0.5 || hi < axisMax - 0.5
  const barRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'lo' | 'hi' | null>(null)
  const [tip, setTip] = useState<{ frac: number; speed: number } | null>(null)

  // 客户端 x → 色带位置比例（0~1）
  const fracOf = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  }

  // 拖动中：全局监听 pointermove/pointerup（指针移出色带/松开都能正确结束）
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const v = Math.round(fracOf(e.clientX) * axisMax)
      if (dragging === 'lo') onChange([Math.min(v, hi - 1), hi])
      else onChange([lo, Math.max(v, lo + 1)])
    }
    const onUp = () => setDragging(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, lo, hi, axisMax, onChange])

  // 浮动提示：拖动中固定显示拖块值，否则显示悬停位置对应速度
  const shown =
    dragging === 'lo'
      ? { frac: lo / axisMax, speed: lo }
      : dragging === 'hi'
        ? { frac: hi / axisMax, speed: hi }
        : tip

  const thumbCls =
    'absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center'
  const knobCls =
    'size-3 rounded-full border-2 border-white bg-blue-500 shadow-md transition-transform'

  return (
    <div className="absolute bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-lg bg-white/10 px-1.5 py-1.5 ring-1 ring-white/15 dark:bg-black/20 dark:ring-white/10">
      <div
        ref={barRef}
        className="relative h-5 w-36"
        onPointerEnter={(e) => setTip({ frac: fracOf(e.clientX), speed: fracOf(e.clientX) * axisMax })}
        onPointerMove={(e) => setTip({ frac: fracOf(e.clientX), speed: fracOf(e.clientX) * axisMax })}
        onPointerLeave={() => setTip(null)}
        // 点击色带空白处：把最近的滑块跳到该位置并进入拖动
        onPointerDown={(e) => {
          const frac = fracOf(e.clientX)
          const v = Math.round(frac * axisMax)
          const next: 'lo' | 'hi' =
            Math.abs(v - lo) <= Math.abs(v - hi) ? 'lo' : 'hi'
          if (next === 'lo') onChange([Math.min(v, hi - 1), hi])
          else onChange([lo, Math.max(v, lo + 1)])
          setDragging(next)
        }}
      >
        {/* 悬停/拖动浮动提示（位置略收边避免溢出） */}
        {shown ? (
          <div
            className="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/85 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-white"
            style={{ left: `${Math.min(Math.max(shown.frac, 0.08), 0.92) * 100}%` }}
          >
            {Math.round(shown.speed)} km/h
          </div>
        ) : null}
        {/* 色带：0 绿 → 中段黄 → 满轴红（与 speedColors STOPS 三段插值一致） */}
        <div
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ background: 'linear-gradient(to right, #22c55e, #eab308 50%, #ef4444)' }}
        />
        {/* 双滑块（自绘）：stopPropagation 防止触发色带的"就近跳转" */}
        <div
          role="slider"
          aria-label="速度下限"
          aria-valuenow={Math.round(lo)}
          className={thumbCls}
          style={{ left: `${(lo / axisMax) * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation()
            setDragging('lo')
          }}
        >
          <div className={`${knobCls} ${dragging === 'lo' ? 'scale-125' : ''}`} />
        </div>
        <div
          role="slider"
          aria-label="速度上限"
          aria-valuenow={Math.round(hi)}
          className={thumbCls}
          style={{ left: `${(hi / axisMax) * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation()
            setDragging('hi')
          }}
        >
          <div className={`${knobCls} ${dragging === 'hi' ? 'scale-125' : ''}`} />
        </div>
      </div>
      {modified ? (
        <button
          type="button"
          onClick={() => onChange([0, axisMax])}
          title="重置筛选范围"
          className="rounded p-1 text-gray-600 hover:bg-white/30 dark:text-gray-300 dark:hover:bg-white/10"
        >
          <RotateCcw size={12} />
        </button>
      ) : null}
    </div>
  )
}
