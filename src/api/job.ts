import request from './request'
import type { PageResult } from '../types/api'
import type { JobPayload, SysJobRow } from '../types/job'

export interface JobListQuery {
  pageNum: number
  pageSize: number
  jobName?: string
  jobGroup?: string
  status?: string
}

export const getJobList = (params: JobListQuery) =>
  request.get<never, PageResult<SysJobRow>>('/system/job/list', { params })

export const addJob = (data: JobPayload) =>
  request.post<never, null>('/system/job', data)

export const editJob = (data: JobPayload) =>
  request.put<never, null>('/system/job', data)

export const deleteJobs = (jobIds: number[]) =>
  request.delete<never, null>(`/system/job/${jobIds.join(',')}`)

// 后端 changeStatus / run 使用 Form 参数，必须以表单格式提交
export const changeJobStatus = (jobId: number, status: string) =>
  request.put<never, null>(
    '/system/job/changeStatus',
    new URLSearchParams({ job_id: String(jobId), status }),
  )

export const runJobOnce = (jobId: number) =>
  request.put<never, null>(
    '/system/job/run',
    new URLSearchParams({ job_id: String(jobId) }),
  )
