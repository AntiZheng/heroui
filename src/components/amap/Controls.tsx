import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Popover,
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@heroui/react'
import {
  Check,
  Compass,
  Layers,
  LoaderCircle,
  LocateFixed,
  Maximize,
  Minimize,
  Minus,
  Plus,
} from 'lucide-react'
import { useAMapConfig, useAMapInstance } from './context'
import { Marker } from './Marker'
import { AMAP_THEMES, type AMapBaseMap } from './styles'

const iconBtnClass =
  'size-7! min-w-7! rounded-full! p-0! border! border-separator! bg-default! text-foreground! shadow-sm! hover:bg-(--default-hover)!'

const BASE_MAPS: { value: AMapBaseMap; label: string }[] = [
  { value: 'standard', label: '标准地图' },
  { value: 'satellite', label: '卫星地图' },
  { value: 'satellite-road', label: '卫星 + 路网' },
]

const optionClass = (selected: boolean) =>
  `flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs transition-colors ${
    selected
      ? 'bg-accent-soft font-medium text-accent'
      : 'text-foreground/80 hover:bg-surface-secondary'
  }`

function getAMapLib(): typeof AMap | undefined {
  return (window as Window & { AMap?: typeof AMap }).AMap
}

interface AMapGeolocationResult {
  position?: AMap.LngLat
  message?: string
}

interface AMapGeolocationInstance {
  getCurrentPosition: (
    callback: (status: string, result?: AMapGeolocationResult) => void,
  ) => void
}

type AMapLibWithLocate = typeof AMap & {
  Geolocation?: new (options?: Record<string, unknown>) => AMapGeolocationInstance
}

interface AMapIpLocation {
  status?: string
  info?: string
  infocode?: string
  city?: string | string[]
  rectangle?: string | string[]
}

function describeLocateError(message?: string): string {
  if (!message) return '未能获取当前位置'
  if (/permission denied/i.test(message)) return '浏览器定位权限被拒绝'
  if (/timeout/i.test(message)) return '定位超时'
  return '未能获取当前位置'
}

function firstText(value?: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

// IP 定位返回的是矩形范围 "西南角;东北角"，取中心点
function parseRectangleCenter(
  rectangle?: string | string[],
): { longitude: number; latitude: number } | null {
  const [southWest, northEast] = firstText(rectangle).split(';')
  if (!southWest || !northEast) return null
  const [x1, y1] = southWest.split(',').map(Number)
  const [x2, y2] = northEast.split(',').map(Number)
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null
  return { longitude: (x1 + x2) / 2, latitude: (y1 + y2) / 2 }
}

function describeIpLocateError(data?: AMapIpLocation): string {
  switch (data?.infocode) {
    case '10007':
      return 'Web服务 Key 未通过数字签名校验'
    case '10009':
      return 'Key 平台不匹配，需要 Web服务 类型的 Key'
    case '10001':
    case '10002':
      return '高德 Key 无效或被停用'
    case '10003':
      return '高德 Key 今日调用量已达上限'
    default:
      return data?.infocode ? `高德返回 ${data.infocode}` : 'IP 定位服务不可用'
  }
}

async function fetchIpLocation(): Promise<AMapIpLocation> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch('/_AMapService/v3/ip', { signal: controller.signal })
    return (await res.json()) as AMapIpLocation
  } finally {
    clearTimeout(timer)
  }
}

export function LayersControl() {
  const map = useAMapInstance()
  const { baseMap, setBaseMap, themeId, setThemeId } = useAMapConfig()
  const [traffic, setTraffic] = useState(false)

  useEffect(() => {
    const AMapLib = getAMapLib()
    if (!AMapLib || baseMap === 'standard') return
    const satellite = new AMapLib.TileLayer.Satellite({ zIndex: 4 })
    const roadNet =
      baseMap === 'satellite-road' ? new AMapLib.TileLayer.RoadNet({ zIndex: 5 }) : null
    map.add(roadNet ? [satellite, roadNet] : satellite)
    return () => {
      map.remove(roadNet ? [satellite, roadNet] : satellite)
    }
  }, [map, baseMap])

  useEffect(() => {
    const AMapLib = getAMapLib()
    if (!AMapLib || !traffic) return
    const layer = new AMapLib.TileLayer.Traffic({
      autoRefresh: true,
      interval: 180,
      zIndex: 6,
    })
    map.add(layer)
    return () => {
      map.remove(layer)
    }
  }, [map, traffic])

  return (
    <Popover>
      <Button aria-label="切换图层" className={iconBtnClass}>
        <Layers className="size-3.5" />
      </Button>
      <Popover.Content placement="left" className="w-56 p-1.5">
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-muted">底图</p>
        <div role="radiogroup" aria-label="底图类型" className="flex flex-col gap-0.5">
          {BASE_MAPS.map((item) => {
            const selected = baseMap === item.value
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setBaseMap(item.value)}
                className={`${optionClass(selected)} h-8`}
              >
                <span className="flex-1 text-left">{item.label}</span>
                {selected ? <Check size={13} aria-hidden /> : null}
              </button>
            )
          })}
        </div>
        <div className="mt-1 border-t border-separator px-2 pb-1.5 pt-2">
          <p className="pb-1 text-[11px] font-medium text-muted">主题</p>
          <div role="radiogroup" aria-label="地图主题" className="grid grid-cols-2 gap-0.5">
            {AMAP_THEMES.map((item) => {
              const selected = themeId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setThemeId(item.id)
                    setBaseMap('standard')
                  }}
                  className={`${optionClass(selected)} h-7`}
                >
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {selected ? <Check size={12} aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-1 border-t border-separator px-2 pb-1.5 pt-2">
          <p className="pb-0.5 text-[11px] font-medium text-muted">叠加</p>
          <Switch
            aria-label="实时路况"
            isSelected={traffic}
            onChange={setTraffic}
            className="w-full"
          >
            <SwitchContent className="flex w-full items-center justify-between gap-4 text-[12px]!">
              实时路况
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </SwitchContent>
          </Switch>
        </div>
      </Popover.Content>
    </Popover>
  )
}

interface LocateTarget {
  longitude: number
  latitude: number
  city?: string
}

export function LocateControl() {
  const map = useAMapInstance()
  const [locating, setLocating] = useState(false)
  const [location, setLocation] = useState<LocateTarget | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const locate = () => {
    if (locating) return
    const AMapLib = getAMapLib() as AMapLibWithLocate | undefined
    if (!AMapLib?.Geolocation) {
      toast('定位失败', { description: '定位服务未加载，请刷新页面重试', variant: 'danger' })
      return
    }

    setLocating(true)

    let finished = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (finished) return
      finished = true
      if (watchdog) clearTimeout(watchdog)
      if (aliveRef.current) setLocating(false)
    }
    watchdog = setTimeout(() => {
      if (finished) return
      finish()
      toast('定位超时', { description: '未能获取位置，请稍后重试', variant: 'danger' })
    }, 15000)

    const locateByIp = async (reason: string) => {
      let data: AMapIpLocation
      try {
        data = await fetchIpLocation()
      } catch {
        if (!aliveRef.current || finished) return
        finish()
        toast('定位失败', { description: `${reason}，城市级定位请求失败`, variant: 'danger' })
        return
      }
      if (!aliveRef.current || finished) return
      const center = data.status === '1' ? parseRectangleCenter(data.rectangle) : null
      if (center) {
        const city = firstText(data.city) || '当前城市'
        map.setZoomAndCenter(11, [center.longitude, center.latitude], true)
        setLocation({ longitude: center.longitude, latitude: center.latitude, city })
        finish()
        toast('已定位到城市', {
          description: `浏览器未授权精确定位，已按 IP 显示${city}的大致位置`,
          variant: 'warning',
        })
        return
      }
      finish()
      toast('定位失败', {
        description: `${reason}，城市级定位也未成功（${describeIpLocateError(data)}）`,
        variant: 'danger',
      })
    }

    const geolocation = new AMapLib.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      showButton: false,
      showMarker: false,
      showCircle: false,
      panToLocation: false,
      zoomToAccuracy: false,
    })

    geolocation.getCurrentPosition((status, result) => {
      if (!aliveRef.current || finished) return
      const position = result?.position
      if (status === 'complete' && position) {
        finish()
        const next = { longitude: position.getLng(), latitude: position.getLat() }
        map.setZoomAndCenter(16, [next.longitude, next.latitude], true)
        setLocation(next)
        return
      }
      void locateByIp(describeLocateError(result?.message))
    })
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <Button
            aria-label="定位到当前位置"
            aria-busy={locating}
            onPress={locate}
            className={iconBtnClass}
          >
            {locating ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LocateFixed className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{locating ? '定位中…' : '定位到当前位置'}</TooltipContent>
      </Tooltip>
      {location ? (
        <Marker latitude={location.latitude} longitude={location.longitude} anchor="center">
          <div className="relative flex items-center justify-center">
            <span
              className={`absolute rounded-full ${
                location.city ? 'size-8 bg-warning/20' : 'size-6 bg-accent/20'
              }`}
            />
            <span
              className={`size-3.5 rounded-full border-2 border-white shadow-md ${
                location.city ? 'bg-warning' : 'bg-accent'
              }`}
            />
            {location.city ? (
              <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-separator bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
                {location.city} · 城市级
              </span>
            ) : null}
          </div>
        </Marker>
      ) : null}
    </>
  )
}

const zoomBtnClass =
  'h-7! min-h-0! w-full! rounded-none! border-0! bg-default! p-0! text-foreground! shadow-none! hover:bg-(--default-hover)!'

const POSITION_CLASS = {
  'top-left': 'left-3 top-3',
  'top-right': 'right-3 top-3',
  'bottom-left': 'bottom-3 left-3',
  'bottom-right': 'bottom-3 right-3',
} as const

export type AMapControlPosition = keyof typeof POSITION_CLASS

export function Controls({
  position = 'bottom-right',
  children,
}: {
  position?: AMapControlPosition
  children?: ReactNode
}) {
  return (
    <div className={`absolute z-20 flex flex-col items-center gap-2 ${POSITION_CLASS[position]}`}>
      {children}
    </div>
  )
}

export function ZoomControl() {
  const map = useAMapInstance()
  return (
    <div className="flex w-7 flex-col overflow-hidden rounded-full border border-separator bg-default shadow-sm">
      <Tooltip>
        <TooltipTrigger>
          <Button aria-label="放大" onPress={() => map.zoomIn()} className={zoomBtnClass}>
            <Plus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>放大</TooltipContent>
      </Tooltip>
      <div className="h-px w-4 self-center bg-separator" />
      <Tooltip>
        <TooltipTrigger>
          <Button aria-label="缩小" onPress={() => map.zoomOut()} className={zoomBtnClass}>
            <Minus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>缩小</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function ResetViewControl() {
  const map = useAMapInstance()
  const [rotation, setRotation] = useState(() => map.getRotation())

  useEffect(() => {
    const sync = () => setRotation(map.getRotation())
    map.on('rotatechange', sync)
    return () => {
      map.off('rotatechange', sync)
    }
  }, [map])

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          aria-label="复位视角"
          onPress={() => {
            map.setPitch(0, false, 300)
            map.setRotation(0, false, 300)
          }}
          className={iconBtnClass}
        >
          <Compass
            className="size-3.5 transition-transform duration-100"
            style={{ transform: `rotate(${-rotation}deg)` }}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>复位视角</TooltipContent>
    </Tooltip>
  )
}

export function FullscreenControl() {
  const map = useAMapInstance()
  const container = map.getContainer().parentElement ?? map.getContainer()
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement === container)

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === container)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
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
          {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isFullscreen ? '退出全屏' : '全屏查看'}</TooltipContent>
    </Tooltip>
  )
}
