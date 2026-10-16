import request from './request'
import type { DeptPayload, SysDeptRow } from '../types/dept'

export interface DeptListQuery {
  deptName?: string
  status?: string
}

export const getDeptList = (params?: DeptListQuery) =>
  request.get<never, SysDeptRow[]>('/system/dept/list', { params })

export const getDeptDetail = (deptId: number) =>
  request.get<never, SysDeptRow>(`/system/dept/${deptId}`)

export const addDept = (data: DeptPayload) => request.post<never, null>('/system/dept', data)

export const editDept = (data: DeptPayload) => request.put<never, null>('/system/dept', data)

export const deleteDepts = (deptIds: number[]) =>
  request.delete<never, null>(`/system/dept/${deptIds.join(',')}`)
