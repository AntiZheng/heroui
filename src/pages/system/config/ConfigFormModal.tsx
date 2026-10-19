import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Input,
  Label,
  ListBox,
  ListBoxItem,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  TextField,
  toast,
} from '@heroui/react'
import { SlidersHorizontal } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch, ReadOnlyInput } from '../../../components/FormSection'
import {
  addConfig,
  editConfig,
  MODAL_BACKDROP_KEY,
  MODAL_BACKDROP_OPTIONS,
} from '../../../api/config'
import type { ConfigPayload, SysConfigRow } from '../../../types/config'

interface Props {
  isOpen: boolean
  editing: SysConfigRow | null
  onClose: () => void
}

const emptyForm = {
  configName: '',
  configKey: '',
  configValue: '',
  configType: 'N',
  remark: '',
}

export default function ConfigFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              configName: editing.config_name,
              configKey: editing.config_key,
              configValue: editing.config_value,
              configType: editing.config_type,
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.configName.trim() || !form.configKey.trim() || !form.configValue.trim()) {
      toast('提示', { description: '请填写参数名称、参数键名和参数键值', variant: 'warning' })
      return
    }
    const payload: ConfigPayload = {
      configName: form.configName.trim(),
      configKey: form.configKey.trim(),
      configValue: form.configValue,
      configType: form.configType,
      remark: form.remark || undefined,
    }
    setSaving(true)
    try {
      if (editing) {
        await editConfig({ ...payload, configId: editing.config_id })
        toast('成功', { description: '修改参数成功', variant: 'success' })
      } else {
        await addConfig(payload)
        toast('成功', { description: '新增参数成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['config-list'] })
      queryClient.invalidateQueries({ queryKey: ['config-key'] })
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  const isBackdropConfig = form.configKey.trim() === MODAL_BACKDROP_KEY

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '编辑参数' : '新增参数'}
      icon={SlidersHorizontal}
      size="md"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基础信息">
        <div className="flex flex-col gap-4">
          <TextField
            value={form.configName}
            onChange={(v) => setForm((f) => ({ ...f, configName: v }))}
            isRequired
          >
            <Label>参数名称</Label>
            <Input placeholder="如 用户初始密码" />
          </TextField>
          <TextField
            value={form.configKey}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                configKey: v,
                configValue:
                  v.trim() === MODAL_BACKDROP_KEY && !f.configValue ? 'opaque' : f.configValue,
              }))
            }
            isRequired
            isDisabled={!!editing}
          >
            <Label>参数键名</Label>
            {editing ? (
              <ReadOnlyInput />
            ) : (
              <Input placeholder="如 sys.user.initPassword" />
            )}
          </TextField>
          {isBackdropConfig ? (
            <SelectRoot
              aria-label="参数键值"
              selectedKey={form.configValue || null}
              onSelectionChange={(key) => {
                if (key != null) setForm((f) => ({ ...f, configValue: String(key) }))
              }}
            >
              <Label>参数键值</Label>
              <SelectTrigger>
                <SelectValue />
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {MODAL_BACKDROP_OPTIONS.map((opt) => (
                    <ListBoxItem key={opt.key} id={opt.key}>
                      {opt.label}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </SelectPopover>
            </SelectRoot>
          ) : (
            <TextField
              value={form.configValue}
              onChange={(v) => setForm((f) => ({ ...f, configValue: v }))}
              isRequired
            >
              <Label>参数键值</Label>
              <Input placeholder="如 123456" />
            </TextField>
          )}
        </div>
      </FormSection>

      <FormSection title="其他设置">
        <div className="flex flex-col gap-4">
          <FormSwitch
            label="系统内置"
            isSelected={form.configType === 'Y'}
            onChange={(v) => setForm((f) => ({ ...f, configType: v ? 'Y' : 'N' }))}
          />
          <TextField value={form.remark} onChange={(v) => setForm((f) => ({ ...f, remark: v }))}>
            <Label>备注</Label>
            <Input />
          </TextField>
        </div>
      </FormSection>
    </FormModal>
  )
}
