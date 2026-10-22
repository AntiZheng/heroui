import { useEffect, useRef, useState } from 'react'
import { SearchField, Spinner } from '@heroui/react'
import { MapPin } from 'lucide-react'
import { useAMapInstance } from './context'
import { loadAMap } from './loader'

export interface AMapPlace {
  id: string
  name: string
  address?: string
  longitude: number
  latitude: number
}

interface AMapPlaceItem {
  id?: string
  name?: string
  district?: string
  address?: string
  pname?: string
  cityname?: string
  adname?: string
  location?: { lng: number; lat: number } | string
}

interface AutoCompleteResult {
  tips?: AMapPlaceItem[]
}

interface PlaceSearchResult {
  poiList?: { pois?: AMapPlaceItem[] }
}

interface AutoCompleteInstance {
  search(
    keyword: string,
    callback: (status: string, result: AutoCompleteResult) => void,
  ): void
}

interface PlaceSearchInstance {
  getDetails(
    id: string,
    callback: (status: string, result: PlaceSearchResult) => void,
  ): void
}

interface AMapPlugins {
  AutoComplete: new (options?: { city?: string; citylimit?: boolean }) => AutoCompleteInstance
  PlaceSearch: new (options?: {
    pageSize?: number
    pageIndex?: number
    citylimit?: boolean
    extensions?: string
  }) => PlaceSearchInstance
}

function pluginsOf(amap: typeof AMap): AMapPlugins {
  return amap as unknown as AMapPlugins
}

function toCoord(location: AMapPlaceItem['location']) {
  if (!location) return null
  if (typeof location === 'string') {
    const [longitude, latitude] = location.split(',').map(Number)
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null
  }
  return Number.isFinite(location.lng) && Number.isFinite(location.lat)
    ? { longitude: location.lng, latitude: location.lat }
    : null
}

function subtitleOf(item: AMapPlaceItem) {
  const area = [item.pname, item.cityname, item.adname].filter(Boolean).join(' · ')
  return [area, item.district, item.address].filter(Boolean).join(' · ')
}

export function PlaceSearch({
  onSelect,
  className,
}: {
  onSelect: (place: AMapPlace) => void
  className?: string
}) {
  const map = useAMapInstance()
  const [keyword, setKeyword] = useState('')
  const [tips, setTips] = useState<AMapPlaceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pluginsReady, setPluginsReady] = useState(false)
  const autoRef = useRef<AutoCompleteInstance | null>(null)
  const placeRef = useRef<PlaceSearchInstance | null>(null)
  const requestIdRef = useRef(0)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let cancelled = false
    void loadAMap()
      .then((AMapLib) => {
        if (cancelled) return
        const { AutoComplete, PlaceSearch: PlaceSearchPlugin } = pluginsOf(AMapLib)
        autoRef.current = new AutoComplete({ city: '全国', citylimit: false })
        placeRef.current = new PlaceSearchPlugin({
          pageSize: 10,
          citylimit: false,
          extensions: 'all',
        })
        setPluginsReady(true)
      })
      .catch(() => {
        if (!cancelled) setPluginsReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const close = () => setOpen(false)
    map.on('click', close)
    return () => {
      map.off('click', close)
    }
  }, [map])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const value = keyword.trim()
    if (!value) {
      setTips([])
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setOpen(true)
    const timer = window.setTimeout(() => {
      const auto = autoRef.current
      if (!auto) {
        setLoading(false)
        return
      }
      auto.search(value, (status, result) => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
        setTips(status === 'complete' && result.tips ? result.tips.filter((tip) => tip.name && tip.id) : [])
      })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [keyword, pluginsReady])

  const handleSelect = (tip: AMapPlaceItem) => {
    const requestId = ++requestIdRef.current
    setOpen(false)
    setLoading(false)

    const apply = (item: AMapPlaceItem) => {
      const coord = toCoord(item.location)
      if (!coord) return
      const place: AMapPlace = {
        id: item.id ?? '',
        name: item.name ?? keyword.trim(),
        address: subtitleOf(item) || undefined,
        longitude: coord.longitude,
        latitude: coord.latitude,
      }
      // 立即跳转：叠加物在缩放动画中创建会按过期的地图像素计算位置，
      // 导致 marker/infoWindow 被定位到视口外
      map.setZoomAndCenter(16, [coord.longitude, coord.latitude], true)
      onSelectRef.current(place)
    }

    if (toCoord(tip.location)) {
      apply(tip)
      return
    }
    if (!tip.id || !placeRef.current) return

    setLoading(true)
    placeRef.current.getDetails(tip.id, (status, result) => {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      const poi = status === 'complete' ? result.poiList?.pois?.[0] : undefined
      if (poi) apply(poi)
    })
  }

  return (
    <div className={`absolute left-3 top-3 z-20 w-60 max-w-[calc(100%-1.5rem)] ${className ?? ''}`}>
      <SearchField
        aria-label="搜索地点"
        value={keyword}
        onChange={setKeyword}
        onSubmit={() => {
          const first = tips[0]
          if (first) handleSelect(first)
        }}
        className="w-full"
      >
        <SearchField.Group className="bg-surface/95 shadow-sm backdrop-blur">
          <SearchField.SearchIcon />
          <SearchField.Input
            placeholder="搜索地点"
            className="text-xs!"
            onFocus={() => {
              if (tips.length > 0) setOpen(true)
            }}
          />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-separator bg-surface shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted">
              <Spinner />
              搜索中…
            </div>
          ) : tips.length > 0 ? (
            <ul role="listbox" aria-label="搜索结果" className="max-h-72 overflow-y-auto py-1">
              {tips.map((tip) => (
                <li key={tip.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleSelect(tip)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-secondary"
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {tip.name}
                      </span>
                      {subtitleOf(tip) ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {subtitleOf(tip)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-xs text-muted">未找到相关地点</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
