export interface SysNoticeRow {
  notice_id: number
  notice_title: string
  notice_type: string
  notice_content?: string | null
  status?: string | null
  create_by?: string | null
  create_time?: string | null
  update_by?: string | null
  update_time?: string | null
  remark?: string | null
}

export interface NoticePayload {
  noticeId?: number
  noticeTitle: string
  noticeType: string
  noticeContent: string
  status: string
  remark?: string
}

export const NOTICE_TYPE_OPTIONS = [
  { key: '1', label: '通知' },
  { key: '2', label: '公告' },
]

export const NOTICE_STATUS_OPTIONS = [
  { key: '0', label: '正常' },
  { key: '1', label: '关闭' },
]

export function optionLabel(options: { key: string; label: string }[], key?: string | null) {
  if (!key) return '—'
  return options.find((option) => option.key === key)?.label ?? key
}
