import { useState } from 'react'
import { AMap, type AMapPlace } from '../../components/amap'

export default function AMapPage() {
  const [place, setPlace] = useState<AMapPlace | null>(null)

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-separator shadow-sm">
      <AMap center={[104.2, 35.9]} zoom={4}>
        <AMap.PlaceSearch onSelect={setPlace} />
        <AMap.Controls position="bottom-right">
          <AMap.LayersControl />
          <AMap.ZoomControl />
          <AMap.ResetViewControl />
          <AMap.FullscreenControl />
          <AMap.LocateControl />
        </AMap.Controls>
        {place ? (
          <AMap.Marker longitude={place.longitude} latitude={place.latitude}>
            <div className="relative flex flex-col items-center">
              <div className="size-7 rounded-full border-2 border-white bg-accent shadow-lg" />
              <div className="h-2 w-0.5 bg-accent" />
            </div>
          </AMap.Marker>
        ) : null}
        <AMap.InfoWindow
          longitude={place?.longitude ?? 0}
          latitude={place?.latitude ?? 0}
          visible={!!place}
          onClose={() => setPlace(null)}
        >
          {place ? (
            <div className="w-56">
              <p className="text-[13px] font-semibold text-foreground">{place.name}</p>
              {place.address ? <p className="mt-1 text-xs text-muted">{place.address}</p> : null}
            </div>
          ) : null}
        </AMap.InfoWindow>
      </AMap>
    </div>
  )
}
