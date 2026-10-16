import MapRoot, { MAP_STYLES, type MapRootProps } from './Map'
import { Marker, MarkerContent, MarkerDot, MarkerLabel, MarkerTooltip } from './Marker'
import { Popup } from './Popup'
import { Controls, CompassControl, ZoomControl } from './Controls'

const Map = Object.assign(MapRoot, {
  Marker,
  MarkerContent,
  MarkerDot,
  MarkerLabel,
  MarkerTooltip,
  Popup,
  Controls,
  ZoomControl,
  CompassControl,
})

export { Map, MAP_STYLES }
export type { MapRootProps }
