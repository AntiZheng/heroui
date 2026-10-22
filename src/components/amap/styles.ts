export const AMAP_THEMES = [
  { id: 'normal', label: '标准' },
  { id: 'light', label: '月光银' },
  { id: 'whitesmoke', label: '远山黛' },
  { id: 'fresh', label: '草色青' },
  { id: 'grey', label: '雅士灰' },
  { id: 'blue', label: '靛青蓝' },
  { id: 'dark', label: '幻影黑' },
  { id: 'darkblue', label: '极夜蓝' },
  { id: 'wine', label: '酱籽' },
  { id: 'macaron', label: '马卡龙' },
  { id: 'graffiti', label: '涂鸦' },
] as const

export type AMapThemeId = (typeof AMAP_THEMES)[number]['id']
export type AMapBaseMap = 'standard' | 'satellite' | 'satellite-road'

export function defaultAMapTheme(theme: 'light' | 'dark'): AMapThemeId {
  return theme === 'dark' ? 'dark' : 'whitesmoke'
}

export function getAMapThemeStyle(id: AMapThemeId): string {
  return `amap://styles/${id}`
}
