export type FileCategory = 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other'
export type FileVisibility = 'private' | 'public'
export type FileSource = 'admin' | 'api' | 'avatar'

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  image: '图片', document: '文档', video: '视频', audio: '音频', archive: '压缩包', other: '其他',
}

export const FILE_SOURCE_LABELS: Record<FileSource, string> = {
  admin: '后台', api: 'API', avatar: '头像',
}

// /system/file/list rows 为后端 model_dump() 的 snake_case
export interface SysFileRow {
  file_id: number
  folder_id: number
  folder_path?: string
  file_name: string
  object_key: string
  bucket: string
  visibility: FileVisibility
  category: FileCategory
  mime_type: string
  file_ext: string
  file_size: number
  etag?: string
  source: FileSource
  api_key_id?: number | null
  api_key_name?: string | null
  uploader_id?: number | null
  uploader_name?: string
  create_time?: string | null
  update_time?: string | null
}

export interface FileFolder {
  folder_id: number
  parent_id: number
  folder_name: string
  folder_path: string
  is_system: number
  sort: number
}

export interface FileListQuery {
  pageNum: number
  pageSize: number
  folderId?: number
  fileName?: string
  category?: string
  visibility?: string
  source?: string
  beginTime?: string
  endTime?: string
}

export interface FileUrlItem {
  file_id: number
  url: string
  is_public: boolean
  expires_at?: string | null
}

// 上传会话初始化载荷（camelCase）
export interface UploadSessionInit {
  fileName: string
  fileSize: number
  mimeType?: string
  folderId?: number
  visibility?: FileVisibility
  folderPath?: string
}

export interface UploadSessionResult {
  session_id: string
  mode: 'single' | 'multipart'
  part_size: number
  part_count: number
  concurrency: number
  upload_url?: string
  method?: string
  headers?: Record<string, string>
  expires_at?: string
}

export interface UploadedPart { part_number: number; etag: string; size?: number }

export interface UploadSessionStatus {
  session_id: string
  file_name: string
  file_size: number
  folder_id: number
  visibility: FileVisibility
  mode: 'single' | 'multipart'
  part_size: number
  part_count: number
  uploaded_parts: UploadedPart[]
  status: string
  expires_at?: string
}
