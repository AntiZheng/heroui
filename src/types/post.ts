export interface SysPostRow {
  post_id: number
  post_code: string
  post_name: string
  post_sort: number
  status: string
  remark?: string | null
  create_time?: string | null
}

export interface PostPayload {
  postId?: number
  postCode: string
  postName: string
  postSort: number
  status: string
  remark?: string
}

export interface PostListQuery {
  pageNum: number
  pageSize: number
  postCode?: string
  postName?: string
  status?: string
}
