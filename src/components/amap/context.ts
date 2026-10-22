import { createContext, useContext } from 'react'
import type { AMapBaseMap, AMapThemeId } from './styles'

const AMapContext = createContext<AMap.Map | null>(null)

export interface AMapConfig {
  baseMap: AMapBaseMap
  setBaseMap: (value: AMapBaseMap) => void
  themeId: AMapThemeId
  setThemeId: (value: AMapThemeId) => void
}

export const AMapConfigContext = createContext<AMapConfig | null>(null)

export function useAMapInstance(): AMap.Map {
  const map = useContext(AMapContext)
  if (!map) throw new Error('AMap 子组件必须放在 <AMap> 内部使用')
  return map
}

export function useAMapConfig(): AMapConfig {
  const config = useContext(AMapConfigContext)
  if (!config) throw new Error('AMap 配置组件必须放在 <AMap> 内部使用')
  return config
}

export default AMapContext
