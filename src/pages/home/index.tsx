import GlassTilt from '../../components/GlassTilt'
import glassBg from '../../assets/hero-glass-bg.webp'
import WeatherPanel from './WeatherPanel'

export default function HomePage() {
  return (
    <GlassTilt className="rounded-2xl border border-white/60 [box-shadow:0_210px_218px_0_rgba(0,0,0,0.07),0_26px_27px_0_rgba(0,0,0,0.04)]">
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6">
        <img src={glassBg} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/15 dark:from-black/70 dark:via-black/45 dark:to-black/25"
        />
        <WeatherPanel />
      </div>
    </GlassTilt>
  )
}
