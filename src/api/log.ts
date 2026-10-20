import request from './request'
import type { PageResult } from '../types/api'
import type { SysLoginLogRow, SysOperLogRow } from '../types/log'

export interface OperLogListQuery {
  pageNum: number
  pageSize: number
  title?: string
  operName?: string
  businessType?: number
  status?: number
  beginTime?: string
  endTime?: string
}

export const getOperLogList = (params: OperLogListQuery) =>
  request.get<never, PageResult<SysOperLogRow>>('/system/operlog/list', { params })

export const deleteOperLogs = (operIds: number[]) =>
  request.delete<never, null>(`/system/operlog/${operIds.join(',')}`)

export const cleanOperLogs = () =>
  request.post<never, null>('/system/operlog/clean')

export interface LoginLogListQuery {
  pageNum: number
  pageSize: number
  userName?: string
  ipaddr?: string
  status?: string
  beginTime?: string
  endTime?: string
}

export const getLoginLogList = (params: LoginLogListQuery) =>
  request.get<never, PageResult<SysLoginLogRow>>('/system/logininfor/list', { params })

export const deleteLoginLogs = (infoIds: number[]) =>
  request.delete<never, null>(`/system/logininfor/${infoIds.join(',')}`)

export const cleanLoginLogs = () =>
  request.post<never, null>('/system/logininfor/clean')
