import request from './request'
import type { PageResult } from '../types/api'
import type {
  DictDataPayload,
  DictTypePayload,
  SysDictDataRow,
  SysDictTypeRow,
} from '../types/dict'

export interface DictTypeListQuery {
  pageNum: number
  pageSize: number
  dictName?: string
  dictType?: string
  status?: string
}

export interface DictDataListQuery {
  pageNum: number
  pageSize: number
  dictType?: string
  dictLabel?: string
  status?: string
}

// ── 字典类型 ──────────────────────────────────────────────────────────────────

export const getDictTypeList = (params: DictTypeListQuery) =>
  request.get<never, PageResult<SysDictTypeRow>>('/system/dict/type/list', { params })

export const getDictTypeDetail = (dictId: number) =>
  request.get<never, SysDictTypeRow>(`/system/dict/type/${dictId}`)

export const addDictType = (data: DictTypePayload) =>
  request.post<never, null>('/system/dict/type', data)

export const editDictType = (data: DictTypePayload) =>
  request.put<never, null>('/system/dict/type', data)

export const deleteDictTypes = (dictIds: number[]) =>
  request.delete<never, null>(`/system/dict/type/${dictIds.join(',')}`)

// ── 字典数据 ──────────────────────────────────────────────────────────────────

export const getDictDataList = (params: DictDataListQuery) =>
  request.get<never, PageResult<SysDictDataRow>>('/system/dict/data/list', { params })

export const getDictDataDetail = (dictCode: number) =>
  request.get<never, SysDictDataRow>(`/system/dict/data/${dictCode}`)

export const addDictData = (data: DictDataPayload) =>
  request.post<never, null>('/system/dict/data', data)

export const editDictData = (data: DictDataPayload) =>
  request.put<never, null>('/system/dict/data', data)

export const deleteDictData = (dictCodes: number[]) =>
  request.delete<never, null>(`/system/dict/data/${dictCodes.join(',')}`)

// 按类型查数据（下拉选项用），后端返回 snake_case 明细
export interface DictOption {
  dict_label: string
  dict_value: string
  css_class?: string | null
  list_class?: string | null
}

export const getDictDataByType = (dictType: string) =>
  request.get<never, DictOption[]>(`/system/dict/data/type/${dictType}`)
