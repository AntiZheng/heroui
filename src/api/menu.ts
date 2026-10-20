import request from './request'
import type { MenuTreeNode } from '../types/role'
import type { MenuListQuery, MenuPayload, SysMenuRow } from '../types/menu'

export const getMenuList = (params?: MenuListQuery) =>
  request.get<never, SysMenuRow[]>('/system/menu/list', { params })

export const addMenu = (data: MenuPayload) =>
  request.post<never, { menu_id: number }>('/system/menu', data)

export const editMenu = (data: MenuPayload) =>
  request.put<never, { menu_id: number }>('/system/menu', data)

export const deleteMenu = (menuId: number) =>
  request.delete<never, null>(`/system/menu/${menuId}`)

export const getMenuTree = () => request.get<never, MenuTreeNode[]>('/system/menu/treeselect')

// 后端返回 { menus, checked_keys }，snake_case
export interface RoleMenuTree {
  menus: MenuTreeNode[]
  checked_keys: number[]
}

export const getRoleMenuTree = (roleId: number) =>
  request.get<never, RoleMenuTree>(`/system/menu/roleMenuTreeselect/${roleId}`)

// 后端返回已选中的部门 ID 列表
export const getRoleDeptTree = (roleId: number) =>
  request.get<never, number[]>(`/system/role/deptTree/${roleId}`)
