import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Input, Label, TextField, toast } from '@heroui/react'
import { BookMarked } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch, ReadOnlyInput } from '../../../components/FormSection'
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
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '编辑字典类型' : '新增字典类型'}
      icon={BookMarked}
      size="md"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基础信息">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            value={form.dictName}
            onChange={(v) => setForm((f) => ({ ...f, dictName: v }))}
            isRequired
          >
            <Label>字典名称</Label>
            <Input />
          </TextField>
          <TextField
            value={form.dictType}
            onChange={(v) => setForm((f) => ({ ...f, dictType: v }))}
            isRequired
            isDisabled={!!editing}
          >
            <Label>字典类型</Label>
            {editing ? <ReadOnlyInput /> : <Input />}
          </TextField>
        </div>
      </FormSection>

      <FormSection title="状态与备注" tone="success">
        <div className="flex flex-col gap-4">
          <FormSwitch
            label="启用字典"
            isSelected={form.status === '0'}
            onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
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
