import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Popover,
  SearchField,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Moon,
  Search,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import {
  getIpCity,
  getWeatherByCity,
  getWeatherByLocation,
  searchWeatherCities,
} from '../../api/weather'
import type { WeatherCast, WeatherCity, WeatherData } from '../../types/weather'

const MANUAL_CITY_KEY = 'home-weather-city'

type WeatherSource = 'gps' | 'ip' | 'manual'

type PanelState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; data: WeatherData; source: WeatherSource }
  | { status: 'empty'; message: string }

const SOURCE_LABELS: Record<WeatherSource, string> = {
  gps: 'GPS 定位',
  ip: 'IP 定位',
  manual: '手动选择',
}

const LEVEL_LABELS: Record<string, string> = {
  city: '城市',
  district: '区县',
  province: '省份',
}

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

interface ManualCity {
  name: string
  adcode: string
}

function readManualCity(): ManualCity | null {
  try {
    const raw = localStorage.getItem(MANUAL_CITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ManualCity>
    return parsed.name ? { name: parsed.name, adcode: parsed.adcode ?? '' } : null
  } catch {
    return null
  }
}

function getBrowserPosition(): Promise<{ longitude: number; latitude: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: { longitude: number; latitude: number } | null) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => finish(null), 6000)
    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
        }),
      () => finish(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 },
    )
  })
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function weekLabel(cast: WeatherCast): string {
  const week = Number(cast.week)
  if (Number.isInteger(week) && week >= 1 && week <= 7) return WEEK_LABELS[week - 1]
  const date = new Date(`${cast.date}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : WEEK_LABELS[(date.getDay() + 6) % 7]
}

function monthDay(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${month}-${day}` : date
}

function reportTime(value: string): string {
  const match = value.match(/^\d{4}-(\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : value
}

function weatherVisual(condition: string, night = false): { Icon: LucideIcon; className: string } {
  const value = condition || ''
  if (/雷/.test(value)) return { Icon: CloudLightning, className: 'text-amber-200' }
  if (/雪|冰雹/.test(value)) return { Icon: CloudSnow, className: 'text-sky-100' }
  if (/雨/.test(value)) return { Icon: CloudRain, className: 'text-sky-200' }
  if (/雾|霾|沙|尘/.test(value)) return { Icon: CloudFog, className: 'text-white/70' }
  if (/多云/.test(value)) {
    return night
      ? { Icon: CloudMoon, className: 'text-indigo-100' }
      : { Icon: CloudSun, className: 'text-amber-100' }
  }
  if (/晴/.test(value)) {
    return night
      ? { Icon: Moon, className: 'text-indigo-100' }
      : { Icon: Sun, className: 'text-amber-300' }
  }
  if (/阴/.test(value)) return { Icon: Cloud, className: 'text-white/80' }
  return { Icon: CloudSun, className: 'text-white/80' }
}

const iconButtonClass =
  'size-7! min-w-7! rounded-full! border! border-white/25! bg-white/15! p-0! text-white! shadow-none! hover:bg-white/25!'

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <span className="flex items-center gap-1 text-white/60">
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
      <b className="font-medium text-white/90">{value}</b>
    </span>
  )
}

function ForecastCard({ cast }: { cast: WeatherCast }) {
  const day = weatherVisual(cast.dayweather)
  const night = weatherVisual(cast.nightweather, true)
  const DayIcon = day.Icon
  const NightIcon = night.Icon
  return (
    <div className="rounded-xl bg-white/10 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-white/90">{weekLabel(cast)}</span>
        <span className="text-[10px] tabular-nums text-white/50">{monthDay(cast.date)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/90">
        <DayIcon className={`size-3.5 shrink-0 ${day.className}`} aria-hidden />
        <span className="truncate">{cast.dayweather}</span>
        <span className="text-white/35">/</span>
        <NightIcon className={`size-3.5 shrink-0 ${night.className}`} aria-hidden />
        <span className="truncate">{cast.nightweather}</span>
      </div>
      <p className="mt-0.5 text-[11px] tabular-nums text-white/80">
        {cast.nighttemp}° ~ {cast.daytemp}°
      </p>
      <p className="mt-0.5 text-[10px] leading-4 text-white/55">
        白天 {cast.daywind}风 {cast.daypower}级 · 夜间 {cast.nightwind}风 {cast.nightpower}级
      </p>
    </div>
  )
}

function WeatherContent({ data }: { data: WeatherData }) {
  const { live, forecast } = data
  const visual = weatherVisual(live.weather)
  const LiveIcon = visual.Icon
  const casts = forecast.casts ?? []
  return (
    <div className="mt-2.5 grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] xl:gap-5">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-3">
          <LiveIcon className={`size-9 shrink-0 ${visual.className}`} strokeWidth={1.6} aria-hidden />
          <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <span className="text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white">
              {live.temperature}
              <span className="ml-0.5 align-top text-[14px] font-normal text-white/65">°C</span>
            </span>
            <span className="pb-0.5 text-[13px] font-medium text-white/90">{live.weather}</span>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
          <Metric icon={Droplets} label="湿度" value={`${live.humidity}%`} />
          <Metric icon={Wind} label="风向" value={`${live.winddirection}风`} />
          <Metric icon={Wind} label="风力" value={`${live.windpower}级`} />
        </div>
      </div>

      {casts.length > 0 && (
        <div className="border-t border-white/20 pt-2.5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <div className="flex h-full flex-col justify-center">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-white/75">未来 {casts.length} 天</span>
              <span className="text-white/50">低温 / 高温</span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {casts.map((cast) => (
                <ForecastCard key={cast.date} cast={cast} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WeatherPanel({ className = '' }: { className?: string }) {
  const [state, setState] = useState<PanelState>({ status: 'loading', message: '正在定位…' })
  const [autoToken, setAutoToken] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const requestIdRef = useRef(0)
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 350)

  const { data: cities, isFetching, isError } = useQuery({
    queryKey: ['weather-cities', debouncedKeyword],
    queryFn: () => searchWeatherCities(debouncedKeyword),
    enabled: pickerOpen && debouncedKeyword.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    const id = ++requestIdRef.current
    let cancelled = false
    const isCurrent = () => !cancelled && id === requestIdRef.current

    const run = async () => {
      const manual = readManualCity()
      if (manual) {
        setState({ status: 'loading', message: '正在获取天气…' })
        try {
          const data = await getWeatherByCity(manual.adcode || manual.name)
          if (isCurrent()) setState({ status: 'ready', data, source: 'manual' })
        } catch {
          if (isCurrent()) setState({ status: 'empty', message: '天气数据获取失败' })
        }
        return
      }

      setState({ status: 'loading', message: '正在定位…' })
      const position = await getBrowserPosition()
      if (!isCurrent()) return

      if (position) {
        setState({ status: 'loading', message: '正在获取天气…' })
        try {
          const data = await getWeatherByLocation(position.longitude, position.latitude)
          if (isCurrent()) {
            setState({ status: 'ready', data, source: 'gps' })
            return
          }
        } catch {
          // 浏览器定位成功但天气服务失败时，继续尝试 IP 城市
        }
        if (!isCurrent()) return
      }

      setState({ status: 'loading', message: '正在按网络定位…' })
      try {
        const ipCity = await getIpCity()
        const data = await getWeatherByCity(ipCity.adcode || ipCity.city)
        if (isCurrent()) setState({ status: 'ready', data, source: 'ip' })
      } catch {
        if (isCurrent()) setState({ status: 'empty', message: '定位失败，暂无法获取天气' })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [autoToken])

  const loadCity = async (name: string, source: WeatherSource) => {
    const id = ++requestIdRef.current
    setState({ status: 'loading', message: '正在获取天气…' })
    try {
      const data = await getWeatherByCity(name)
      if (id === requestIdRef.current) setState({ status: 'ready', data, source })
    } catch {
      if (id === requestIdRef.current)
        setState({ status: 'empty', message: '天气数据获取失败' })
    }
  }

  const chooseCity = (city: WeatherCity) => {
    localStorage.setItem(
      MANUAL_CITY_KEY,
      JSON.stringify({ name: city.name, adcode: city.adcode }),
    )
    setPickerOpen(false)
    setKeyword('')
    void loadCity(city.adcode || city.name, 'manual')
  }

  const relocate = () => {
    localStorage.removeItem(MANUAL_CITY_KEY)
    setAutoToken((token) => token + 1)
  }

  const live = state.status === 'ready' ? state.data.live : null
  const source = state.status === 'ready' ? state.source : null
  const cityName =
    live?.city ?? (state.status === 'loading' ? '定位中…' : '未获取位置')

  return (
    <section className={`relative text-white ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-white/75" aria-hidden />
            <h3 className="truncate text-[13px] font-semibold text-white">{cityName}</h3>
            {source ? (
              <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-px text-[10px] font-medium text-white/85">
                {SOURCE_LABELS[source]}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-white/60">
            {live
              ? `${live.province} · ${reportTime(live.reporttime)} 更新`
              : '自动定位 · 也可手动选择城市'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Popover
            isOpen={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open)
              if (!open) setKeyword('')
            }}
          >
            <Button
              size="sm"
              aria-label="选择城市"
              className="h-7! min-w-0! gap-1! rounded-full! border! border-white/25! bg-white/15! px-2! text-[11px]! text-white! shadow-none! hover:bg-white/25!"
            >
              <Search className="size-3" aria-hidden />
              换城市
            </Button>
            <Popover.Content placement="bottom end" className="w-64 p-2">
              <SearchField
                aria-label="搜索城市"
                value={keyword}
                onChange={setKeyword}
                onSubmit={() => {
                  const first = cities?.[0]
                  if (first) chooseCity(first)
                }}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="输入城市名" className="text-xs!" autoFocus />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <div className="mt-2 max-h-60 overflow-y-auto">
                {isFetching && !cities ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
                    <Spinner />
                    搜索中…
                  </div>
                ) : isError ? (
                  <p className="px-2 py-3 text-xs text-muted">搜索失败，请稍后重试</p>
                ) : !debouncedKeyword ? (
                  <p className="px-2 py-3 text-xs text-muted">输入城市名后选择</p>
                ) : cities && cities.length > 0 ? (
                  <ul role="listbox" aria-label="城市搜索结果" className="flex flex-col">
                    {cities.map((city) => (
                      <li key={city.adcode}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => chooseCity(city)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-secondary"
                        >
                          <span className="truncate text-foreground">{city.name}</span>
                          <span className="shrink-0 text-[10px] text-muted">
                            {LEVEL_LABELS[city.level] ?? city.level}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-3 text-xs text-muted">未找到匹配的城市</p>
                )}
              </div>
            </Popover.Content>
          </Popover>
          <Tooltip>
            <TooltipTrigger>
              <Button aria-label="重新定位" onPress={relocate} className={iconButtonClass}>
                <LocateFixed className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重新定位</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {state.status === 'loading' ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-white/70">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {state.message}
        </div>
      ) : state.status === 'empty' ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-3 py-3 text-[11px] leading-5 text-white/70">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.message}，请检查网络或手动选择城市。</span>
        </div>
      ) : (
        <WeatherContent data={state.data} />
      )}
    </section>
  )
}
