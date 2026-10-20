export type MenuType = 'M' | 'C' | 'F'

export interface SysMenuRow {
  menu_id: number
  menu_name: string
  parent_id: number
  order_num: number
  path?: string | null
  component?: string | null
  query?: string | null
  route_name?: string | null
  is_frame?: number | null
  is_cache?: number | null
  menu_type: MenuType
  visible?: string | null
  status?: string | null
  perms?: string | null
  icon?: string | null
  create_time?: string | null
  update_time?: string | null
  children?: SysMenuRow[]
}

export interface MenuPayload {
  menuId?: number
  menuName: string
  parentId: number
  orderNum: number
  path?: string
  component?: string
  query?: string
  routeName?: string
  isFrame?: number
  isCache?: number
  menuType: MenuType
  visible?: string
  status?: string
  perms?: string
  icon?: string
}

export interface MenuListQuery {
  menuName?: string
  status?: string
  menuType?: MenuType
}
