import { Map } from '../../components/map'

export default function MapDemoPage() {
  return (
    <div className="relative -mx-6 h-full min-h-0 overflow-hidden rounded-2xl border border-separator bg-surface shadow-sm">
      <Map center={[112, 22]} zoom={1.3} language="zh" />
    </div>
  )
}
