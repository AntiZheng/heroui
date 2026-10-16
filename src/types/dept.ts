export interface SysDeptRow {
  dept_id: number
  dept_name: string
  parent_id: number
  ancestors: string
  order_num: number
  leader?: string | null
  phone?: string | null
  email?: string | null
  status: string
  create_time?: string | null
  children?: SysDeptRow[]
}

// 后端 AddDept/EditDept 必填 parentId + ancestors，ancestors 由前端从树上计算
export interface DeptPayload {
  deptId?: number
  parentId: number
  ancestors: string
  deptName: string
  orderNum: number
  leader?: string
  phone?: string
  email?: string
  status?: string
}
