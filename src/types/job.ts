export interface SysJobRow {
  job_id: number
  job_name: string
  job_group: string
  job_executor?: string | null
  invoke_target: string
  job_args?: string | null
  job_kwargs?: string | null
  cron_expression: string
  misfire_policy: string
  concurrent: string
  status: string
  create_by?: string | null
  create_time?: string | null
  update_by?: string | null
  update_time?: string | null
  remark?: string | null
}

export interface JobPayload {
  jobId?: number
  jobName: string
  jobGroup: string
  invokeTarget: string
  cronExpression: string
  misfirePolicy: string
  concurrent: string
  status: string
  jobArgs?: string
  jobKwargs?: string
  remark?: string
}

export const JOB_GROUP_OPTIONS = [
  { key: 'DEFAULT', label: '默认' },
  { key: 'SYSTEM', label: '系统' },
]

export const JOB_STATUS_OPTIONS = [
  { key: '0', label: '正常' },
  { key: '1', label: '暂停' },
]

export const MISFIRE_OPTIONS = [
  { key: '1', label: '立即执行' },
  { key: '2', label: '执行一次' },
  { key: '3', label: '放弃执行' },
]

export const CONCURRENT_OPTIONS = [
  { key: '0', label: '允许' },
  { key: '1', label: '禁止' },
]

export function optionLabel(options: { key: string; label: string }[], key: string) {
  return options.find((o) => o.key === key)?.label ?? key
}
