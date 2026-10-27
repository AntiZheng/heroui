export type ApiKeyScope = 'upload' | 'download' | 'list' | 'delete'

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  upload: '上传', download: '下载', list: '列表', delete: '删除',
}

// /system/api-key/list rows 为后端 model_dump() 的 snake_case
export interface SysApiKeyRow {
  key_id: number
  key_name: string
  access_key: string
  secret_hint: string
  scopes: ApiKeyScope[]
  folder_id: number
  quota_bytes: number
  used_bytes: number
  quota_mb: number
  expires_at?: string | null
  status: string
  last_used_at?: string | null
  last_used_ip?: string
  remark?: string | null
  create_time?: string | null
}

export interface ApiKeyCreatePayload {
  keyName: string
  scopes: ApiKeyScope[]
  folderName?: string
  quotaMb?: number
  expiresAt?: string
  remark?: string
}

export interface ApiKeyUpdatePayload {
  keyId: number
  keyName?: string
  scopes?: ApiKeyScope[]
  quotaMb?: number
  expiresAt?: string | null
  status?: string
  remark?: string
}

export interface ApiKeySecretResult { key: SysApiKeyRow; secret: string }
export interface ApiKeyResetResult { key_id: number; secret: string }
