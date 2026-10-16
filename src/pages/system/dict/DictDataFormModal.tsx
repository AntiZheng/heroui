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
  toast,
  useOverlayState,
} from '@heroui/react'
import { addDictData, editDictData } from '../../../api/dict'
import type { DictDataPayload, SysDictDataRow } from '../../../types/dict'

interface Props {
  isOpen: boolean
  editing: SysDictDataRow | null
  dictType: string
  onClose: () => void
}

const emptyForm = {
  dictLabel: '',
  dictValue: '',
  dictSort: '0',
  listClass: 'default',
  isDefault: 'N',
  status: '0',
  remark: '',
}

const LIST_CLASS_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'primary', label: '主要' },
  { value: 'success', label: '成功' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'danger', label: '危险' },
]

export default function DictDataFormModal({ isOpen, editing, dictType, onClose }: Props) {
  const queryClient = useQueryClient()
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              dictLabel: editing.dict_label,
              dictValue: editing.dict_value,
              dictSort: String(editing.dict_sort),
              listClass: editing.list_class || 'default',
              isDefault: editing.is_default ?? 'N',
              status: editing.status,
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.dictLabel.trim() || !form.dictValue.trim()) {
      toast('提示', { description: '请填写标签和键值', variant: 'warning' })
      return
    }
    const payload: DictDataPayload = {
      dictSort: Number(form.dictSort) || 0,
      dictLabel: form.dictLabel.trim(),
      dictValue: form.dictValue.trim(),
      dictType,
      listClass: form.listClass,
      isDefault: form.isDefault,
      status: form.status,
      remark: form.remark || undefined,
    }
    setSaving(true)
    try {
      if (editing) {
        await editDictData({ ...payload, dictCode: editing.dict_code })
        toast('成功', { description: '修改字典数据成功', variant: 'success' })
      } else {
        await addDictData(payload)
        toast('成功', { description: '新增字典数据成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['dict-data-list'] })
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
            <ModalHeader>{editing ? '编辑字典数据' : '新增字典数据'}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  value={form.dictLabel}
                  onChange={(v) => setForm((f) => ({ ...f, dictLabel: v }))}
                  isRequired
                >
                  <Label>标签</Label>
                  <Input placeholder="如 男" />
                </TextField>
                <TextField
                  value={form.dictValue}
                  onChange={(v) => setForm((f) => ({ ...f, dictValue: v }))}
                  isRequired
                >
                  <Label>键值</Label>
                  <Input placeholder="如 0" />
                </TextField>
                <TextField
                  value={form.dictSort}
                  onChange={(v) => setForm((f) => ({ ...f, dictSort: v }))}
                >
                  <Label>显示排序</Label>
                  <Input inputMode="numeric" />
                </TextField>
                <SelectRoot
                  aria-label="回显样式"
                  selectedKey={form.listClass}
                  onSelectionChange={(key) => {
                    if (key != null) setForm((f) => ({ ...f, listClass: String(key) }))
                  }}
                >
                  <Label>回显样式</Label>
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {LIST_CLASS_OPTIONS.map((opt) => (
                        <ListBoxItem key={opt.value} id={opt.value}>
                          {opt.label}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
              </div>
              <div className="flex gap-6">
                <Switch
                  isSelected={form.isDefault === 'Y'}
                  onChange={(v) => setForm((f) => ({ ...f, isDefault: v ? 'Y' : 'N' }))}
                  aria-label="是否默认"
                >
                  <SwitchContent>
                    <SwitchControl>
                      <SwitchThumb />
                    </SwitchControl>
                  </SwitchContent>
                  是否默认
                </Switch>
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
              </div>
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
