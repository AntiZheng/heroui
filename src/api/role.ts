import request from './request'
import type { PageResult } from '../types/api'
import type { RoleDetail, RolePayload, SysRoleRow } from '../types/role'
import type { SysUserRow } from '../types/user'

export interface RoleListQuery {
  pageNum: number
  pageSize: number
  roleName?: string
  roleKey?: string
  status?: string
}

export interface AuthUserQuery {
  pageNum: number
  pageSize: number
  userName?: string
  phonenumber?: string
}

// changeStatus/dataScope 走 EditRole schema，必填字段需一并传
const basePayload = (row: Pick<SysRoleRow, 'role_name' | 'role_key' | 'role_sort' | 'data_scope' | 'status'>) => ({
  roleName: row.role_name,
  roleKey: row.role_key,
  roleSort: row.role_sort,
  dataScope: row.data_scope ?? '1',
  menuIds: [],
  deptIds: [],
})

export const getRoleList = (params: RoleListQuery) =>
  request.get<never, PageResult<SysRoleRow>>('/system/role/list', { params })

export const getRoleDetail = (roleId: number) =>
  request.get<never, RoleDetail>(`/system/role/${roleId}`)

export const addRole = (data: RolePayload) => request.post<never, null>('/system/role', data)

export const editRole = (data: RolePayload) => request.put<never, null>('/system/role', data)

export const deleteRoles = (roleIds: number[]) =>
  request.delete<never, null>(`/system/role/${roleIds.join(',')}`)

export const changeRoleStatus = (row: SysRoleRow, status: string) =>
  request.put<never, null>('/system/role/changeStatus', { ...basePayload(row), roleId: row.role_id, status })

export const editRoleDataScope = (
  row: SysRoleRow,
  dataScope: string,
  deptIds: number[],
  deptCheckStrictly: number = 1,
) =>
  request.put<never, null>('/system/role/dataScope', {
    ...basePayload(row),
    roleId: row.role_id,
    status: row.status,
    dataScope,
    deptIds,
    deptCheckStrictly,
  })

export const getAllocatedUsers = (roleId: number, params: AuthUserQuery) =>
  request.get<never, PageResult<SysUserRow>>('/system/role/authUser/allocatedList', {
    params: { roleId, ...params },
  })

export const getUnallocatedUsers = (roleId: number, params: AuthUserQuery) =>
  request.get<never, PageResult<SysUserRow>>('/system/role/authUser/unallocatedList', {
    params: { roleId, ...params },
  })

// 后端这几个接口用 Form 接参
export const selectAllAuthUsers = (roleId: number, userIds: number[]) => {
  const form = new URLSearchParams({ roleId: String(roleId), userIds: userIds.join(',') })
  return request.put<never, null>('/system/role/authUser/selectAll', form)
}

export const cancelAuthUser = (userId: number, roleId: number) => {
  const form = new URLSearchParams({ userId: String(userId), roleId: String(roleId) })
  return request.put<never, null>('/system/role/authUser/cancel', form)
}

export const cancelAllAuthUsers = (roleId: number, userIds: number[]) => {
  const form = new URLSearchParams({ roleId: String(roleId), userIds: userIds.join(',') })
  return request.put<never, null>('/system/role/authUser/cancelAll', form)
}
