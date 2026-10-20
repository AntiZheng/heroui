import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Input, Label, TextField, toast } from '@heroui/react'
import { Briefcase } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch } from '../../../components/FormSection'
import { addPost, editPost } from '../../../api/post'
import type { PostPayload, SysPostRow } from '../../../types/post'

interface Props {
  isOpen: boolean
  editing: SysPostRow | null
  onClose: () => void
}

const emptyForm = {
  postName: '',
  postCode: '',
  postSort: '0',
  status: '0',
  remark: '',
}

export default function PostFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              postName: editing.post_name,
              postCode: editing.post_code,
              postSort: String(editing.post_sort),
              status: editing.status,
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.postName.trim() || !form.postCode.trim()) {
      toast('提示', { description: '请填写岗位名称和岗位编码', variant: 'warning' })
      return
    }
    const sort = Number(form.postSort)
    if (!Number.isFinite(sort)) {
      toast('提示', { description: '显示排序必须为数字', variant: 'warning' })
      return
    }
    const payload: PostPayload = {
      postName: form.postName.trim(),
      postCode: form.postCode.trim(),
      postSort: sort,
      status: form.status,
      remark: form.remark.trim() || undefined,
    }
    setSaving(true)
    try {
      if (editing) {
        await editPost({ ...payload, postId: editing.post_id })
        toast('成功', { description: '修改岗位成功', variant: 'success' })
      } else {
        await addPost(payload)
        toast('成功', { description: '新增岗位成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['post-list'] })
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
      title={editing ? '编辑岗位' : '新增岗位'}
      icon={Briefcase}
      size="md"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基础信息">
        <div className="flex flex-col gap-4">
          <TextField
            value={form.postName}
            onChange={(v) => setForm((f) => ({ ...f, postName: v }))}
            isRequired
          >
            <Label>岗位名称</Label>
            <Input />
          </TextField>
          <TextField
            value={form.postCode}
            onChange={(v) => setForm((f) => ({ ...f, postCode: v }))}
            isRequired
          >
            <Label>岗位编码</Label>
            <Input />
          </TextField>
          <TextField
            value={form.postSort}
            onChange={(v) => setForm((f) => ({ ...f, postSort: v }))}
          >
            <Label>显示排序</Label>
            <Input inputMode="numeric" />
          </TextField>
        </div>
      </FormSection>

      <FormSection title="状态与备注">
        <div className="flex flex-col gap-4">
          <FormSwitch
            label="启用岗位"
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
