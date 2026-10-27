import request from './request'
import type { PageResult } from '../types/api'
import type {
  FileFolder, FileListQuery, FileUrlItem, SysFileRow,
  UploadSessionInit, UploadSessionResult, UploadSessionStatus,
} from '../types/file'

export const getFileList = (params: FileListQuery) =>
  request.get<never, PageResult<SysFileRow>>('/system/file/list', { params })

export const getFileFolders = () =>
  request.get<never, FileFolder[]>('/system/file/folders')

export const createFolder = (data: { parentId: number; folderName: string }) =>
  request.post<never, { folder_id: number }>('/system/file/folder', data)

export const updateFolder = (folderId: number, data: { folderName?: string; parentId?: number }) =>
  request.put<never, null>(`/system/file/folder/${folderId}`, data)

export const deleteFolders = (ids: number[]) =>
  request.delete<never, null>(`/system/file/folder/${ids.join(',')}`)

export const updateFile = (fileId: number, data: { fileName?: string; folderId?: number }) =>
  request.put<never, null>(`/system/file/${fileId}`, data)

export const deleteFiles = (ids: number[]) =>
  request.delete<never, { deleted: number; failed: string[] }>(`/system/file/${ids.join(',')}`)

export const getFileUrls = (fileIds: number[], download = false) =>
  request.post<never, FileUrlItem[]>('/system/file/urls', { fileIds, download })

export const getFileText = (fileId: number) =>
  request.get<never, { content: string; truncated: boolean }>(`/system/file/${fileId}/text`)

// 上传会话：初始化 →（分片时逐片取预签名 URL 上传）→ complete / abort
export const initUploadSession = (data: UploadSessionInit) =>
  request.post<never, UploadSessionResult>('/system/file/upload/sessions', data)

export const getUploadSession = (sessionId: string) =>
  request.get<never, UploadSessionStatus>(`/system/file/upload/sessions/${sessionId}`)

export const getUploadPartUrls = (sessionId: string, partNumbers: number[]) =>
  request.post<never, { part_number: number; url: string }[]>(
    `/system/file/upload/sessions/${sessionId}/part-urls`, { partNumbers })

export const completeUploadSession = (sessionId: string, parts: { partNumber: number; etag: string }[] = []) =>
  request.post<never, { file_id: number }>(`/system/file/upload/sessions/${sessionId}/complete`, { parts })

export const abortUploadSession = (sessionId: string) =>
  request.delete<never, null>(`/system/file/upload/sessions/${sessionId}`)

export const getActiveUploadSessions = () =>
  request.get<never, UploadSessionStatus[]>('/system/file/upload/sessions', { params: { status: 'active' } })
