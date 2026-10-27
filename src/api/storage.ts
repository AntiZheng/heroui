import request from './request'
import type { StorageCheckItem, StorageConfig, StorageConfigPayload, StorageInitItem } from '../types/storage'

export const getStorageConfig = () =>
  request.get<never, StorageConfig | null>('/system/storage/config')

export const saveStorageConfig = (data: StorageConfigPayload) =>
  request.put<never, StorageConfig>('/system/storage/config', data)

export const testStorage = (data?: StorageConfigPayload) =>
  request.post<never, StorageCheckItem[]>('/system/storage/test', data ?? {})

export const initStorageBuckets = () =>
  request.post<never, StorageInitItem[]>('/system/storage/init')
