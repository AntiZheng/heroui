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
import { addDictType, editDictType } from '../../../api/dict'
import type { DictTypePayload, SysDictTypeRow } from '../../../types/dict'

interface Props {
  isOpen: boolean
  editing: SysDictTypeRow | null
  onClose: () => void
}

const emptyForm = {
  dictName: '',
  dictType: '',
  status: '0',
  remark: '',
}

export default function DictTypeFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              dictName: editing.dict_name,
              dictType: editing.dict_type,
              status: editing.status,
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.dictName.trim() || !form.dictType.trim()) {
      toast('提示', { description: '请填写字典名称和字典类型', variant: 'warning' })
      return
    }
    const payload: DictTypePayload = {
      dictName: form.dictName.trim(),
      dictType: form.dictType.trim(),
      status: form.status,
      remark: form.remark || undefined,
    }
    setSaving(true)
    try {
      if (editing) {
        await editDictType({ ...payload, dictId: editing.dict_id })
        toast('成功', { description: '修改字典类型成功', variant: 'success' })
      } else {
        await addDictType(payload)
        toast('成功', { description: '新增字典类型成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['dict-type-list'] })
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
            <ModalHeader>{editing ? '编辑字典类型' : '新增字典类型'}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <TextField
                value={form.dictName}
                onChange={(v) => setForm((f) => ({ ...f, dictName: v }))}
                isRequired
              >
                <Label>字典名称</Label>
                <Input placeholder="如 用户性别" />
              </TextField>
              <TextField
                value={form.dictType}
                onChange={(v) => setForm((f) => ({ ...f, dictType: v }))}
                isRequired
                isDisabled={!!editing}
              >
                <Label>字典类型</Label>
                <Input placeholder="如 sys_user_sex" />
              </TextField>
              <Switch
                isSelected={form.status === '0'}
                onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
                aria-label="状态正常"
              >
                <SwitchContent>
                  <SwitchControl>
                    <SwitchThumb />
                  </SwitchControl>
                </SwitchContent>
                状态正常
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
