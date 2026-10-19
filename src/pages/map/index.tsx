import { useState } from 'react'
import { Map } from '../../components/map'

export default function MapPage() {
  const [language, setLanguage] = useState('zh')
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-separator shadow-sm">
      <Map center={[112, 22]} zoom={1.3} language={language} transparentBackground>
        <Map.Controls position="bottom-right">
          <Map.ZoomControl />
          <Map.CompassControl />
          <Map.LanguageControl value={language} onChange={setLanguage} />
          <Map.FullscreenControl />
        </Map.Controls>
      </Map>
    </div>
  )
}
