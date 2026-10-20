export interface SysOperLogRow {
  oper_id: number
  title?: string | null
  business_type?: number | null
  method?: string | null
  request_method?: string | null
  operator_type?: number | null
  oper_name?: string | null
  dept_name?: string | null
  oper_url?: string | null
  oper_ip?: string | null
  oper_location?: string | null
  oper_param?: string | null
  json_result?: string | null
  status?: number | null
  error_msg?: string | null
  oper_time?: string | null
  cost_time?: number | null
}

export interface SysLoginLogRow {
  info_id: number
  user_name?: string | null
  ipaddr?: string | null
  login_location?: string | null
  browser?: string | null
  os?: string | null
  status?: string | null
  msg?: string | null
  login_time?: string | null
}

export const OPER_BUSINESS_TYPE_LABELS: Record<number, string> = {
  0: '其他',
  1: '新增',
  2: '修改',
  3: '删除',
}

export const OPER_BUSINESS_TYPE_OPTIONS = [
  { key: '0', label: '其他' },
  { key: '1', label: '新增' },
  { key: '2', label: '修改' },
  { key: '3', label: '删除' },
] as const

export const OPER_STATUS_OPTIONS = [
  { key: '0', label: '正常' },
  { key: '1', label: '异常' },
] as const

export const LOGIN_STATUS_OPTIONS = [
  { key: '0', label: '成功' },
  { key: '1', label: '失败' },
] as const
