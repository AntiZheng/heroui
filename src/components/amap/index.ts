import AMapRoot, { type AMapRootProps } from './Map'
import { Marker } from './Marker'
import { InfoWindow } from './InfoWindow'
import {
  Controls,
  FullscreenControl,
  LayersControl,
  LocateControl,
  ResetViewControl,
  ZoomControl,
} from './Controls'
import { PlaceSearch, type AMapPlace } from './Search'

const AMap = Object.assign(AMapRoot, {
  Marker,
  InfoWindow,
  Controls,
  ZoomControl,
  ResetViewControl,
  FullscreenControl,
  LayersControl,
  LocateControl,
  PlaceSearch,
})

export { AMap }
export type { AMapRootProps, AMapPlace }
