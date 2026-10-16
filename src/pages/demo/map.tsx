import { useState } from 'react'
import { Map } from '../../components/map'

export default function MapDemoPage() {
  const [language, setLanguage] = useState('zh')
  return (
    <div className="relative -mx-6 h-full min-h-0 overflow-hidden rounded-2xl border border-separator bg-surface shadow-sm">
      <Map center={[112, 22]} zoom={1.3} language={language}>
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
