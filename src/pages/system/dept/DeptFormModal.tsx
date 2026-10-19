import { useEffect, useMemo, useState } from 'react'
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
import { Building2 } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch } from '../../../components/FormSection'
import { addDept, editDept } from '../../../api/dept'
import type { DeptPayload, SysDeptRow } from '../../../types/dept'
import { computeAncestors, collectSubtreeIds, findRow } from './deptTree'

interface Props {
  isOpen: boolean
  editing: SysDeptRow | null
  presetParentId?: number
  tree: SysDeptRow[]
  onClose: () => void
}

const emptyForm = {
  parentId: '0',
  deptName: '',
  orderNum: '0',
  leader: '',
  phone: '',
  email: '',
  status: '0',
}

export default function DeptFormModal({ isOpen, editing, presetParentId, tree, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // 上级部门选项：顶级 + 树平铺缩进；编辑时排除自己及子树
  const parentOptions = useMemo(() => {
    const editingRow = editing ? findRow(tree, editing.dept_id) : null
    const hidden = new Set(editingRow ? collectSubtreeIds(editingRow) : [])
    const options: { id: number; label: string }[] = [{ id: 0, label: '顶级部门' }]
    const walk = (rows: SysDeptRow[], depth: number) => {
      for (const row of rows) {
        if (!hidden.has(row.dept_id)) {
          options.push({ id: row.dept_id, label: `${'　'.repeat(depth)}${row.dept_name}` })
          walk(row.children ?? [], depth + 1)
        }
      }
    }
    walk(tree, 0)
    return options
  }, [tree, editing])

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              parentId: String(editing.parent_id),
              deptName: editing.dept_name,
              orderNum: String(editing.order_num),
              leader: editing.leader ?? '',
              phone: editing.phone ?? '',
              email: editing.email ?? '',
              status: editing.status,
            }
          : { ...emptyForm, parentId: String(presetParentId ?? 0) },
      )
    }
  }, [isOpen, editing, presetParentId])

  const handleSubmit = async () => {
    if (!form.deptName.trim()) {
      toast('提示', { description: '请填写部门名称', variant: 'warning' })
      return
    }
    const parentId = Number(form.parentId)
    const parent = parentId === 0 ? null : findRow(tree, parentId)
    const payload: DeptPayload = {
      parentId,
      ancestors: computeAncestors(parent),
      deptName: form.deptName.trim(),
      orderNum: Number(form.orderNum) || 0,
      leader: form.leader || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      status: form.status,
    }
    setSaving(true)
    try {
      if (editing) {
        await editDept({ ...payload, deptId: editing.dept_id })
        toast('成功', { description: '修改部门成功', variant: 'success' })
      } else {
        await addDept(payload)
        toast('成功', { description: '新增部门成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['dept-list'] })
      queryClient.invalidateQueries({ queryKey: ['dept-tree'] })
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
      title={editing ? '编辑部门' : '新增部门'}
      icon={Building2}
      size="lg"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="归属信息">
        <div className="grid grid-cols-2 gap-4">
          <SelectRoot
            aria-label="上级部门"
            selectedKey={form.parentId}
            onSelectionChange={(key) => {
              if (key != null) setForm((f) => ({ ...f, parentId: String(key) }))
            }}
          >
            <Label>上级部门</Label>
            <SelectTrigger>
              <SelectValue />
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {parentOptions.map((opt) => (
                  <ListBoxItem key={String(opt.id)} id={String(opt.id)}>
                    {opt.label}
                  </ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </SelectRoot>
          <TextField
            value={form.deptName}
            onChange={(v) => setForm((f) => ({ ...f, deptName: v }))}
            isRequired
          >
            <Label>部门名称</Label>
            <Input />
          </TextField>
          <TextField
            value={form.orderNum}
            onChange={(v) => setForm((f) => ({ ...f, orderNum: v }))}
          >
            <Label>显示排序</Label>
            <Input inputMode="numeric" />
          </TextField>
        </div>
      </FormSection>

      <FormSection title="联系信息">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            value={form.leader}
            onChange={(v) => setForm((f) => ({ ...f, leader: v }))}
          >
            <Label>负责人</Label>
            <Input />
          </TextField>
          <TextField value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))}>
            <Label>联系电话</Label>
            <Input />
          </TextField>
          <TextField value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))}>
            <Label>邮箱</Label>
            <Input />
          </TextField>
        </div>
      </FormSection>

      <FormSection title="部门状态" tone="success">
        <FormSwitch
          label="启用部门"
          isSelected={form.status === '0'}
          onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
        />
      </FormSection>
    </FormModal>
  )
}
