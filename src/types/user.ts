export type { PageResult } from './api'

// getInfo 返回的 user 是后端 model_dump() 的 snake_case
export interface CurrentUserInfo {
  user_id: number
  user_name: string
  nick_name: string
  avatar?: string
  dept_id?: number
  [key: string]: unknown
}

// /user/list rows 为 ORM 序列化结果，snake_case，无嵌套 dept/roles
export interface SysUserRow {
  user_id: number
  dept_id?: number
  user_name: string
  nick_name: string
  email?: string | null
  phonenumber?: string | null
  sex?: string | null
  avatar?: string | null
  status: string
  login_ip?: string | null
  login_date?: string | null
  create_time?: string | null
  remark?: string | null
}

export interface DeptTreeNode {
  id: number
  label: string
  parentId: number
  children?: DeptTreeNode[]
}

export interface UserPayload {
  userId?: number
  userName: string
  nickName: string
  password?: string
  deptId: number
  roleIds: number[]
  postIds: number[]
  email?: string
  phonenumber?: string
  avatar?: string
  sex?: string
  status?: string
  remark?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface CaptchaResult {
  uuid: string
  img: string
  captchaEnabled: boolean
}

export interface ServerInfo {
  cpu: { cpuNum: number; cpuUsed: number; [key: string]: unknown }
  memory: { total: number; used: number; free: number; usage: number }
  disk: { total: number; used: number; free: number; usage: number }
  python: { version: string; [key: string]: unknown }
  sys: Record<string, unknown>
}
