import request from './request'
import type { PageResult } from '../types/api'
import type {
  ApiKeyCreatePayload, ApiKeyResetResult, ApiKeySecretResult,
  ApiKeyUpdatePayload, SysApiKeyRow,
} from '../types/apiKey'

export interface ApiKeyListQuery { pageNum: number; pageSize: number; keyName?: string; status?: string }

export const getApiKeyList = (params: ApiKeyListQuery) =>
  request.get<never, PageResult<SysApiKeyRow>>('/system/api-key/list', { params })

export const addApiKey = (data: ApiKeyCreatePayload) =>
  request.post<never, ApiKeySecretResult>('/system/api-key', data)

export const editApiKey = (data: ApiKeyUpdatePayload) =>
  request.put<never, null>('/system/api-key', data)

export const resetApiKey = (keyId: number) =>
  request.post<never, ApiKeyResetResult>(`/system/api-key/${keyId}/reset`)

export const deleteApiKeys = (ids: number[]) =>
  request.delete<never, null>(`/system/api-key/${ids.join(',')}`)
