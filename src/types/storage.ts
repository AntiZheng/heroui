export interface StorageConfig {
  internal_endpoint: string
  public_endpoint: string
  region: string
  access_key: string
  has_secret: boolean
  secret_hint: string
  private_bucket: string
  public_bucket: string
  public_base_url: string
  allowed_origins: string
  max_file_size_mb: number
  multipart_threshold_mb: number
  part_size_mb: number
  upload_concurrency: number
  upload_session_expire_hours: number
  upload_presign_expire_minutes: number
  download_presign_expire_seconds: number
  default_visibility: 'private' | 'public'
  allowed_extensions: string
}

// 保存载荷：全字段可选（camelCase 由后端别名兼容），secretKey 单独传入
export interface StorageConfigPayload extends Partial<Omit<StorageConfig, 'has_secret' | 'secret_hint'>> {
  secretKey?: string
}

export interface StorageCheckItem { key: string; ok: boolean; message: string }

export interface StorageInitItem { key: string; ok: boolean; message: string }
