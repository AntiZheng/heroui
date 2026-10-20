import type { ReactNode } from 'react'
import { Button, Chip } from '@heroui/react'
import { ScrollText } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection } from '../../../components/FormSection'
import { OPER_BUSINESS_TYPE_LABELS, type SysOperLogRow } from '../../../types/log'

interface Props {
  log: SysOperLogRow | null
  onClose: () => void
}

const BUSINESS_COLOR: Record<number, 'default' | 'success' | 'accent' | 'danger'> = {
  0: 'default',
  1: 'success',
  2: 'accent',
  3: 'danger',
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

function prettyJson(raw?: string | null) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function InfoField({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex min-h-8 cursor-default items-center rounded-lg border border-separator bg-surface-secondary px-3 py-1.5 text-[13px] leading-5 break-all select-none">
        {children}
      </div>
    </div>
  )
}

function JsonBlock({ value }: { value?: string | null }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-xl border border-separator bg-surface-secondary p-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-foreground">
      {prettyJson(value) || '—'}
    </pre>
  )
}

export default function OperLogDetailModal({ log, onClose }: Props) {
  return (
    <FormModal
      isOpen={log !== null}
      onClose={onClose}
      title="操作日志详情"
      icon={ScrollText}
      size="lg"
      footer={
        <Button variant="tertiary" size="sm" onPress={onClose}>
          关闭
        </Button>
      }
    >
      {log && (
        <>
          <FormSection title="基本信息">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoField label="操作模块">{log.title || '—'}</InfoField>
              <InfoField label="操作类型">
                <Chip
                  color={BUSINESS_COLOR[log.business_type ?? 0] ?? 'default'}
                  size="sm"
                  variant="soft"
                >
                  {OPER_BUSINESS_TYPE_LABELS[log.business_type ?? 0] ?? '其他'}
                </Chip>
              </InfoField>
              <InfoField label="请求方式">{log.request_method || '—'}</InfoField>
              <InfoField label="操作状态">
                <Chip
                  color={log.status === 1 ? 'danger' : 'success'}
                  size="sm"
                  variant="soft"
                >
                  {log.status === 1 ? '异常' : '正常'}
                </Chip>
              </InfoField>
              <InfoField label="操作人员">{log.oper_name || '—'}</InfoField>
              <InfoField label="部门名称">{log.dept_name || '—'}</InfoField>
              <InfoField label="操作地址">{log.oper_ip || '—'}</InfoField>
              <InfoField label="操作地点">{log.oper_location || '—'}</InfoField>
              <InfoField label="消耗时间">{`${log.cost_time ?? 0} ms`}</InfoField>
              <InfoField label="操作时间">{formatTime(log.oper_time)}</InfoField>
              <InfoField label="方法名称" wide>
                {log.method || '—'}
              </InfoField>
              <InfoField label="请求地址" wide>
                {log.oper_url || '—'}
              </InfoField>
            </div>
          </FormSection>

          <FormSection title="请求参数">
            <JsonBlock value={log.oper_param} />
          </FormSection>

          <FormSection title="返回参数">
            <JsonBlock value={log.json_result} />
          </FormSection>

          {log.error_msg ? (
            <FormSection title="异常信息" tone="danger">
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-[13px] leading-5 break-all whitespace-pre-wrap text-danger-soft-foreground select-text">
                {log.error_msg}
              </div>
            </FormSection>
          ) : null}
        </>
      )}
    </FormModal>
  )
}
