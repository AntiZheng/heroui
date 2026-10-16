import { useLayoutEffect, useRef, useState } from 'react'

const GRAY = 'var(--color-surface-secondary)'
const R_BOTTOM = 16
const R_TOP = 10

type Sliver = {
  left?: number
  right?: number
  top?: number
  bottom?: number
  size: number
  background: string
}

export default function TableCornerOverlays() {
  const ref = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(32)
  const [vBar, setVBar] = useState(0)
  const [hBar, setHBar] = useState(0)

  useLayoutEffect(() => {
    const sc = ref.current?.parentElement
    if (!sc) return
    const thead = sc.querySelector('thead')
    const update = () => {
      if (thead) setHeaderH(thead.getBoundingClientRect().height)
      setVBar(sc.offsetWidth - sc.clientWidth)
      setHBar(sc.offsetHeight - sc.clientHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(sc)
    if (thead) ro.observe(thead)
    return () => ro.disconnect()
  }, [])

  // 顶部两片与首行 10px 圆角（index.css）对齐：静止时灰叠灰不可见，
  // 滚动后往方正白行上补出同尺寸凹角，交界在滚动中恒定圆角；
  // 底部两片校正横向滚动条占位的弧线偏移
  const slivers: Sliver[] = [
    { left: 4, top: headerH, size: R_TOP, background: `radial-gradient(circle at 100% 100%, transparent ${R_TOP - 0.5}px, ${GRAY} ${R_TOP}px)` },
    { right: 4 + vBar, top: headerH, size: R_TOP, background: `radial-gradient(circle at 0 100%, transparent ${R_TOP - 0.5}px, ${GRAY} ${R_TOP}px)` },
    { left: 4, bottom: 4 + hBar, size: R_BOTTOM, background: `radial-gradient(circle at 100% 0, transparent ${R_BOTTOM - 0.5}px, ${GRAY} ${R_BOTTOM}px)` },
    { right: 4 + vBar, bottom: 4 + hBar, size: R_BOTTOM, background: `radial-gradient(circle at 0 0, transparent ${R_BOTTOM - 0.5}px, ${GRAY} ${R_BOTTOM}px)` },
  ]

  return (
    <div aria-hidden ref={ref} className="contents">
      {slivers.map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute z-30"
          style={{
            left: s.left,
            right: s.right,
            top: s.top,
            bottom: s.bottom,
            width: s.size,
            height: s.size,
            background: s.background,
          }}
        />
      ))}
    </div>
  )
}
