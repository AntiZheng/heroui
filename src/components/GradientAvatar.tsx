import avatarBlue from '../assets/avatars/blue.jpg'
import avatarBlueLight from '../assets/avatars/blue-light.jpg'
import avatarSky from '../assets/avatars/sky.jpg'
import avatarEmerald from '../assets/avatars/emerald.jpg'
import avatarGreen from '../assets/avatars/green.jpg'
import avatarRose from '../assets/avatars/rose.jpg'
import avatarRed from '../assets/avatars/red.jpg'
import avatarOrange from '../assets/avatars/orange.jpg'
import avatarPurple from '../assets/avatars/purple.jpg'
import avatarIndigo from '../assets/avatars/indigo.jpg'

const AVATARS = [
  avatarBlue,
  avatarBlueLight,
  avatarSky,
  avatarEmerald,
  avatarGreen,
  avatarRose,
  avatarRed,
  avatarOrange,
  avatarPurple,
  avatarIndigo,
]

// 按 seed 哈希取图：同一用户稳定拿到同一颗彩球，多用户同屏时颜色随机错开
function pickAvatar(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATARS[Math.abs(hash) % AVATARS.length]
}

/** 无头像时的默认头像：HeroUI 官方弥散渐变彩球（预渲染图片资产），颜色由 seed（user_id）决定 */
export function GradientAvatar({ seed, className }: { seed?: string | number; className?: string }) {
  return (
    <img
      aria-hidden
      alt=""
      src={pickAvatar(String(seed ?? 'U'))}
      className={`inline-block shrink-0 rounded-full object-cover ${className ?? ''}`}
    />
  )
}
