export interface R<T = unknown> {
  code: number
  msg: string
  success: boolean
  data?: T
}

export interface PageResult<T = unknown> {
  code: number
  msg: string
  success: boolean
  rows: T[]
  total: number
  pageNum: number
  pageSize: number
}
