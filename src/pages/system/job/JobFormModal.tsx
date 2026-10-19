import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  TextField,
  Typography,
  toast,
  useOverlayState,
} from '@heroui/react'
import { addJob, editJob } from '../../../api/job'
import {
  CONCURRENT_OPTIONS,
  JOB_GROUP_OPTIONS,
  MISFIRE_OPTIONS,
  type JobPayload,
  type SysJobRow,
} from '../../../types/job'

interface Props {
  isOpen: boolean
  editing: SysJobRow | null
  onClose: () => void
}

const emptyForm = {
  jobName: '',
  jobGroup: 'DEFAULT',
  invokeTarget: '',
  cronExpression: '',
  misfirePolicy: '3',
  concurrent: '1',
  status: '0',
  jobArgs: '',
  jobKwargs: '',
  remark: '',
}

export default function JobFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              jobName: editing.job_name,
              jobGroup: editing.job_group?.toUpperCase() || 'DEFAULT',
              invokeTarget: editing.invoke_target,
              cronExpression: editing.cron_expression,
              misfirePolicy: editing.misfire_policy,
              concurrent: editing.concurrent,
              status: editing.status,
              jobArgs: editing.job_args ?? '',
              jobKwargs: editing.job_kwargs ?? '',
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.jobName.trim() || !form.invokeTarget.trim() || !form.cronExpression.trim()) {
      toast('提示', { description: '请填写任务名称、调用目标和 cron 表达式', variant: 'warning' })
      return
    }
    // 后端使用 APScheduler CronTrigger.from_crontab，仅支持标准 5 段
    if (form.cronExpression.trim().split(/\s+/).length !== 5) {
      toast('提示', {
        description: 'cron 表达式需为标准 5 段：分 时 日 月 周，如 */5 * * * *',
        variant: 'warning',
      })
      return
    }
    const payload: JobPayload = {
      jobName: form.jobName.trim(),
      jobGroup: form.jobGroup,
      invokeTarget: form.invokeTarget.trim(),
      cronExpression: form.cronExpression.trim(),
      misfirePolicy: form.misfirePolicy,
      concurrent: form.concurrent,
      status: form.status,
      jobArgs: form.jobArgs.trim() || undefined,
      jobKwargs: form.jobKwargs.trim() || undefined,
      remark: form.remark || undefined,
    }
    setSaving(true)
    try {
      if (editing) {
        await editJob({ ...payload, jobId: editing.job_id })
        toast('成功', { description: '修改任务成功', variant: 'success' })
      } else {
        await addJob(payload)
        toast('成功', { description: '新增任务成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['job-list'] })
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalRoot state={state}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>{editing ? '编辑任务' : '新增任务'}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <TextField
                value={form.jobName}
                onChange={(v) => setForm((f) => ({ ...f, jobName: v }))}
                isRequired
              >
                <Label>任务名称</Label>
                <Input placeholder="如 清理临时文件" />
              </TextField>
              <div className="grid grid-cols-2 gap-3">
                <SelectRoot
                  aria-label="任务分组"
                  selectedKey={form.jobGroup}
                  onSelectionChange={(key) => {
                    if (key != null) setForm((f) => ({ ...f, jobGroup: String(key) }))
                  }}
                >
                  <Label>任务分组</Label>
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {JOB_GROUP_OPTIONS.map((o) => (
                        <ListBoxItem key={o.key} id={o.key}>
                          {o.label}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
                <div className="flex items-end pb-2">
                  <Switch
                    isSelected={form.status === '0'}
                    onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
                    aria-label="任务状态"
                  >
                    <SwitchContent>
                      <SwitchControl>
                        <SwitchThumb />
                      </SwitchControl>
                    </SwitchContent>
                    启用任务
                  </Switch>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <TextField
                  value={form.invokeTarget}
                  onChange={(v) => setForm((f) => ({ ...f, invokeTarget: v }))}
                  isRequired
                >
                  <Label>调用目标</Label>
                  <Input placeholder="如 demoTask" />
                </TextField>
                <Typography.Paragraph size="xs" color="muted">
                  已注册目标：demoTask、cleanupTask、healthCheckTask、dataSyncTask
                </Typography.Paragraph>
              </div>
              <div className="flex flex-col gap-1">
                <TextField
                  value={form.cronExpression}
                  onChange={(v) => setForm((f) => ({ ...f, cronExpression: v }))}
                  isRequired
                >
                  <Label>cron 表达式</Label>
                  <Input placeholder="*/5 * * * *" className="font-mono" />
                </TextField>
                <Typography.Paragraph size="xs" color="muted">
                  标准 5 段：分 时 日 月 周，如 */5 * * * * 表示每 5 分钟执行一次
                </Typography.Paragraph>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectRoot
                  aria-label="错误策略"
                  selectedKey={form.misfirePolicy}
                  onSelectionChange={(key) => {
                    if (key != null) setForm((f) => ({ ...f, misfirePolicy: String(key) }))
                  }}
                >
                  <Label>错误策略</Label>
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {MISFIRE_OPTIONS.map((o) => (
                        <ListBoxItem key={o.key} id={o.key}>
                          {o.label}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
                <SelectRoot
                  aria-label="是否并发"
                  selectedKey={form.concurrent}
                  onSelectionChange={(key) => {
                    if (key != null) setForm((f) => ({ ...f, concurrent: String(key) }))
                  }}
                >
                  <Label>是否并发</Label>
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {CONCURRENT_OPTIONS.map((o) => (
                        <ListBoxItem key={o.key} id={o.key}>
                          {o.label}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
              </div>
              <TextField
                value={form.jobArgs}
                onChange={(v) => setForm((f) => ({ ...f, jobArgs: v }))}
              >
                <Label>位置参数</Label>
                <Input placeholder="多个参数用英文逗号分隔" />
              </TextField>
              <TextField
                value={form.jobKwargs}
                onChange={(v) => setForm((f) => ({ ...f, jobKwargs: v }))}
              >
                <Label>关键字参数</Label>
                <Input placeholder="如 source=a,target=b" />
              </TextField>
              <TextField value={form.remark} onChange={(v) => setForm((f) => ({ ...f, remark: v }))}>
                <Label>备注</Label>
                <Input />
              </TextField>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onClose}>
                取消
              </Button>
              <Button variant="primary" isPending={saving} onPress={handleSubmit}>
                保存
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  )
}
