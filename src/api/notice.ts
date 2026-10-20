import request from './request'
import type { PageResult } from '../types/api'
import type { NoticePayload, SysNoticeRow } from '../types/notice'

export interface NoticeListQuery {
  pageNum: number
  pageSize: number
  noticeTitle?: string
  noticeType?: string
  status?: string
  createBy?: string
}

export const getNoticeList = (params: NoticeListQuery) =>
  request.get<never, PageResult<SysNoticeRow>>('/system/notice/list', { params })

export const getNoticeDetail = (noticeId: number) =>
  request.get<never, SysNoticeRow>(`/system/notice/${noticeId}`)

export const addNotice = (data: NoticePayload) =>
  request.post<never, null>('/system/notice', data)

export const editNotice = (data: NoticePayload) =>
  request.put<never, null>('/system/notice', data)

export const deleteNotices = (noticeIds: number[]) =>
  request.delete<never, null>(`/system/notice/${noticeIds.join(',')}`)
