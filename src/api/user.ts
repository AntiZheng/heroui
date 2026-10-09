import request from './request'
import type { DeptTreeNode, PageResult, SysUserRow, UserPayload } from '../types/user'

export interface UserListQuery {
  pageNum: number
  pageSize: number
  userName?: string
  phonenumber?: string
  status?: string
  deptId?: number
}

export const getUserList = (params: UserListQuery) =>
  request.get<never, PageResult<SysUserRow>>('/system/user/list', { params })

export const getDeptTree = () => request.get<never, DeptTreeNode[]>('/system/user/deptTree')

export const addUser = (data: UserPayload) => request.post<never, null>('/system/user', data)

export const editUser = (data: UserPayload) => request.put<never, null>('/system/user', data)

export const deleteUsers = (userIds: number[]) =>
  request.delete<never, null>(`/system/user/${userIds.join(',')}`)

export const resetPwd = (userId: number, password: string) =>
  request.put<never, null>('/system/user/resetPwd', { userId, password })

export const changeStatus = (row: SysUserRow, status: string) =>
  request.put<never, null>('/system/user/changeStatus', {
    userId: row.user_id,
    userName: row.user_name,
    nickName: row.nick_name,
    deptId: row.dept_id,
    roleIds: [],
    postIds: [],
    status,
  })
