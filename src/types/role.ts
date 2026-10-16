export interface SysRoleRow {
  role_id: number
  role_name: string
  role_key: string
  role_sort: number
  data_scope?: string
  status: string
  remark?: string | null
  create_time?: string | null
}

export interface RoleDetail extends SysRoleRow {
  menu_ids: number[]
  dept_ids: number[]
}

export interface RolePayload {
  roleId?: number
  roleName: string
  roleKey: string
  roleSort: number
  dataScope: string
  status: string
  remark?: string
  menuIds: number[]
  deptIds: number[]
}

export interface MenuTreeNode {
  id: number
  label: string
  children?: MenuTreeNode[]
}
