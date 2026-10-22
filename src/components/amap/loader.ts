import { load } from '@amap/amap-jsapi-loader'

let loading: Promise<typeof AMap> | null = null

export function loadAMap(): Promise<typeof AMap> {
  if (loading) return loading

  const key = import.meta.env.VITE_AMAP_KEY
  if (!key) {
    return Promise.reject(new Error('未配置 VITE_AMAP_KEY，请在 .env.local 中填写高德 Web 端 Key'))
  }

  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/_AMapService`,
  }

  loading = (load({
    key,
    version: '2.0',
    plugins: ['AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geolocation'],
  }) as Promise<typeof AMap>).catch((err: unknown) => {
    loading = null
    throw err
  })

  return loading
}
