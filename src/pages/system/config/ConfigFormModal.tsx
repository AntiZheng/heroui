import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Label,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  TextField,
  toast,
  useOverlayState,
} from '@heroui/react'
import { addConfig, editConfig } from '../../../api/config'
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
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
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
        <ModalContainer size="md">
          <ModalDialog>
            <ModalHeader>{editing ? '编辑参数' : '新增参数'}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
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
                onChange={(v) => setForm((f) => ({ ...f, configKey: v }))}
                isRequired
                isDisabled={!!editing}
              >
                <Label>参数键名</Label>
                <Input placeholder="如 sys.user.initPassword" />
              </TextField>
              <TextField
                value={form.configValue}
                onChange={(v) => setForm((f) => ({ ...f, configValue: v }))}
                isRequired
              >
                <Label>参数键值</Label>
                <Input placeholder="如 123456" />
              </TextField>
              <Switch
                isSelected={form.configType === 'Y'}
                onChange={(v) => setForm((f) => ({ ...f, configType: v ? 'Y' : 'N' }))}
                aria-label="系统内置"
              >
                <SwitchContent>
                  <SwitchControl>
                    <SwitchThumb />
                  </SwitchControl>
                </SwitchContent>
                系统内置
              </Switch>
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
