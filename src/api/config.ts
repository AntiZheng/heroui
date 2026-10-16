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
export const getConfigByKey = (configKey: string) =>
  request.get<never, string | null>(`/system/config/configKey/${configKey}`)

export const PLATFORM_NAME_KEY = 'sys.platform.name'
