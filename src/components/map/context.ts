import { createContext, useContext } from 'react'
import type { Map as MlMap } from 'maplibre-gl'

const MapContext = createContext<MlMap | null>(null)

export function useMapInstance(): MlMap {
  const map = useContext(MapContext)
  if (!map) throw new Error('Map 子组件必须放在 <Map> 内部使用')
  return map
}

export default MapContext
