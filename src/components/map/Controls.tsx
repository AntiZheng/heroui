import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ControlPosition, IControl } from 'maplibre-gl'
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownItemIndicator,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger,
  Header,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react'
import { useMapInstance } from './context'

// 统一 HeroUI 风格的地图圆形图标按钮：28px、浅灰 default 底、separator 描边
const iconBtnClass =
  'size-7! min-w-7! rounded-full! p-0! border! border-separator! bg-default! text-foreground! shadow-sm! hover:bg-(--default-hover)!'

// 缩放胶囊内按钮：去掉自身圆角与描边，由外层胶囊统一裁切
const zoomBtnClass =
  'h-7! min-h-0! w-full! rounded-none! border-0! bg-default! p-0! text-foreground! shadow-none! hover:bg-(--default-hover)!'

/**
 * 官方 MapLibre 控件图标（路径逐字取自 maplibre-gl.css 内置 data-uri SVG，viewBox 29×29），
 * heroui.pro 的 Map 控件即基于此。
 */
function ZoomInIcon() {
  return (
    <svg viewBox="0 0 29 29" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="M14.5 8.5c-.75 0-1.5.75-1.5 1.5v3h-3c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h3v3c0 .75.75 1.5 1.5 1.5S16 19.75 16 19v-3h3c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-3v-3c0-.75-.75-1.5-1.5-1.5" />
    </svg>
  )
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 29 29" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="M10 13c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h9c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13z" />
    </svg>
  )
}

/** 红北灰南的罗盘指针（官方针形几何，北半随主题用红色），随地图旋转 */
function CompassIcon({ bearing }: { bearing: number }) {
  return (
    <svg
      viewBox="0 0 29 29"
      className="size-3.5 transition-transform duration-100"
      style={{ transform: `rotate(${-bearing}deg)` }}
      aria-hidden
    >
      <path fill="#ef4444" d="m10.5 14 4-8 4 8z" />
      <path fill="#ccc" d="m10.5 16 4 8 4-8z" />
    </svg>
  )
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 29 29" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="M24 16v5.5c0 1.75-.75 2.5-2.5 2.5H16v-1l3-1.5-4-5.5 1-1 5.5 4 1.5-3zM6 16l1.5 3 5.5-4 1 1-4 5.5 3 1.5v1H7.5C5.75 24 5 23.25 5 21.5V16zm7-11v1l-3 1.5 4 5.5-1 1-5.5-4L6 13H5V7.5C5 5.75 5.75 5 7.5 5zm11 2.5c0-1.75-.75-2.5-2.5-2.5H16v1l3 1.5-4 5.5 1 1 5.5-4 1.5 3h1z" />
    </svg>
  )
}

function ShrinkIcon() {
  return (
    <svg viewBox="0 0 29 29" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="M18.5 16c-1.75 0-2.5.75-2.5 2.5V24h1l1.5-3 5.5 4 1-1-4-5.5 3-1.5v-1zM13 18.5c0-1.75-.75-2.5-2.5-2.5H5v1l3 1.5L4 24l1 1 5.5-4 1.5 3h1zm3-8c0 1.75.75 2.5 2.5 2.5H24v-1l-3-1.5L25 5l-1-1-5.5 4L17 5h-1zM10.5 13c1.75 0 2.5-.75 2.5-2.5V5h-1l-1.5 3L5 4 4 5l4 5.5L5 12v1z" />
    </svg>
  )
}

export function Controls({ position = 'top-right', children }: { position?: ControlPosition; children?: ReactNode }) {
  const map = useMapInstance()
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    // 必须带 maplibregl-ctrl 类：角落容器为 pointer-events:none，仅该类子元素恢复可点击
    el.className = 'maplibregl-ctrl map-controls-host'
    const control: IControl = {
      onAdd: () => el,
      onRemove: () => el.remove(),
      getDefaultPosition: () => position,
    }
    map.addControl(control, position)
    setHost(el)
    return () => {
      map.removeControl(control)
      setHost(null)
    }
  }, [map, position])

  if (!host) return null
  return createPortal(<div className="flex flex-col items-center gap-2">{children}</div>, host)
}

export function ZoomControl() {
  const map = useMapInstance()
  return (
    <div className="flex w-7 flex-col overflow-hidden rounded-full border border-separator bg-default shadow-sm">
      <Tooltip>
        <TooltipTrigger>
          <Button aria-label="放大" onPress={() => map.zoomIn()} className={zoomBtnClass}>
            <ZoomInIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>放大</TooltipContent>
      </Tooltip>
      <div className="h-px w-4 self-center bg-separator" />
      <Tooltip>
        <TooltipTrigger>
          <Button aria-label="缩小" onPress={() => map.zoomOut()} className={zoomBtnClass}>
            <ZoomOutIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>缩小</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function CompassControl() {
  const map = useMapInstance()
  const [bearing, setBearing] = useState(map.getBearing())
  useEffect(() => {
    const onRotate = () => setBearing(map.getBearing())
    map.on('rotate', onRotate)
    return () => {
      map.off('rotate', onRotate)
    }
  }, [map])
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button aria-label="重置朝向" onPress={() => map.easeTo({ bearing: 0, pitch: 0, duration: 300 })} className={iconBtnClass}>
          <CompassIcon bearing={bearing} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>重置朝向</TooltipContent>
    </Tooltip>
  )
}

/** 标注语言图标：@gravity-ui/icons 官方 globe（HeroUI 文档同款图标库，完全对称） */
function LanguageIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.208 12.346c-.485 1-.953 1.154-1.208 1.154s-.723-.154-1.208-1.154c-.372-.768-.647-1.858-.749-3.187a21 21 0 0 0 3.914 0c-.102 1.329-.377 2.419-.75 3.187m.788-4.699C9.358 7.714 8.69 7.75 8 7.75s-1.358-.036-1.996-.103c.037-1.696.343-3.075.788-3.993C7.277 2.654 7.745 2.5 8 2.5s.723.154 1.208 1.154c.445.918.75 2.297.788 3.993m1.478 1.306c-.085 1.516-.375 2.848-.836 3.874a5.5 5.5 0 0 0 2.843-4.364c-.621.199-1.295.364-2.007.49m1.918-2.043c-.572.204-1.21.379-1.901.514-.056-1.671-.354-3.14-.853-4.251a5.5 5.5 0 0 1 2.754 3.737m-8.883.514c.056-1.671.354-3.14.853-4.251A5.5 5.5 0 0 0 2.608 6.91c.572.204 1.21.379 1.901.514M2.52 8.463a5.5 5.5 0 0 0 2.843 4.364c-.46-1.026-.75-2.358-.836-3.874a15.5 15.5 0 0 1-2.007-.49M15 8A7 7 0 1 0 1 8a7 7 0 0 0 14 0"
      />
    </svg>
  )
}

const LANGUAGE_OPTIONS = [
  { id: 'zh', label: '简体中文' },
  { id: 'en', label: 'English' },
  { id: 'local', label: '本地名称' },
] as const

/** 地图标注语言切换（OpenMapTiles name:<lang> 字段）：带 "Choose a language" 标题与选中勾选标记 */
export function LanguageControl({ value, onChange }: { value: string; onChange: (lang: string) => void }) {
  return (
    <Dropdown>
      <Tooltip>
        <TooltipTrigger>
          <DropdownTrigger>
            <Button isIconOnly aria-label="标注语言" className={iconBtnClass}>
              <LanguageIcon />
            </Button>
          </DropdownTrigger>
        </TooltipTrigger>
        <TooltipContent>标注语言</TooltipContent>
      </Tooltip>
      <DropdownPopover placement="right top" className="min-w-[140px]">
        <DropdownMenu
          aria-label="标注语言"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([value])}
          onSelectionChange={(keys) => {
            if (keys === 'all') return
            const key = [...keys][0]
            if (key != null) onChange(String(key))
          }}
        >
          <DropdownSection>
            <Header>Choose a language</Header>
            {LANGUAGE_OPTIONS.map((opt) => (
              <DropdownItem key={opt.id} id={opt.id} textValue={opt.label}>
                <DropdownItemIndicator />
                <Label>{opt.label}</Label>
              </DropdownItem>
            ))}
          </DropdownSection>
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  )
}

/** 全屏查看地图（对地图容器做 Fullscreen API 切换） */
export function FullscreenControl() {
  const map = useMapInstance()
  const container = map.getContainer()
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement === container)

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === container)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [container])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen().catch(() => {
        // 浏览器拒绝全屏（如非用户手势触发）时静默忽略
      })
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          aria-label={isFullscreen ? '退出全屏' : '全屏查看'}
          onPress={toggleFullscreen}
          className={iconBtnClass}
        >
          {isFullscreen ? <ShrinkIcon /> : <FullscreenIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isFullscreen ? '退出全屏' : '全屏查看'}</TooltipContent>
    </Tooltip>
  )
}
