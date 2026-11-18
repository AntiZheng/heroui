import request from './request'
import type { PageResult } from '../types/api'
import type { ConfigPayload, SysConfigRow } from '../types/config'

export interface ConfigListQuery {
  pageNum: number
  pageSize: number
  configName?: string
  configKey?: string
  configType?: string
}

export const getConfigList = (params: ConfigListQuery) =>
  request.get<never, PageResult<SysConfigRow>>('/system/config/list', { params })

export const addConfig = (data: ConfigPayload) =>
  request.post<never, null>('/system/config', data)

export const editConfig = (data: ConfigPayload) =>
  request.put<never, null>('/system/config', data)

export const deleteConfigs = (configIds: number[]) =>
  request.delete<never, null>(`/system/config/${configIds.join(',')}`)

export const refreshConfigCache = () =>
  request.post<never, null>('/system/config/refreshCache')

// 按键名查参数值（后端只读 Redis），未配置时返回 null
export const getConfigByKey = (configKey: string, silent = false) =>
  request.get<never, string | null>(`/system/config/configKey/${configKey}`, { silent })

export const PLATFORM_NAME_KEY = 'sys.platform.name'

export const REGISTER_USER_KEY = 'sys.account.registerUser'

export const MODAL_BACKDROP_KEY = 'sys.modal.backdrop'

export const MODAL_BACKDROP_OPTIONS = [
  { key: 'opaque', label: '半透明遮罩（不虚化）' },
  { key: 'blur', label: '背景虚化' },
  { key: 'transparent', label: '完全透明' },
] as const

export type ModalBackdropVariant = (typeof MODAL_BACKDROP_OPTIONS)[number]['key']

// 全局按钮样式：3d 为玻璃釉面立体效果（默认），flat 为扁平无阴影
export const BUTTON_STYLE_KEY = 'sys.ui.style'

export const BUTTON_STYLE_OPTIONS = [
  { key: '3d', label: '立体玻璃釉面' },
  { key: 'flat', label: '扁平' },
] as const

export type ButtonStyleVariant = (typeof BUTTON_STYLE_OPTIONS)[number]['key']

// 轨迹路段解析方法：tile 为 OSM 瓦片逐点匹配（现状），hmm 为隐马尔可夫全局匹配
export const ROAD_MATCHER_KEY = 'sys.track.roadMatcher'

export const ROAD_MATCHER_OPTIONS = [
  { key: 'tile', label: '瓦片匹配（现状）' },
  { key: 'hmm', label: 'HMM 匹配' },
] as const
