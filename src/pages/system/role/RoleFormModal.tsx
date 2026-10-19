import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Input,
  Label,
  Spinner,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import { ShieldCheck } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch } from '../../../components/FormSection'
import { addRole, editRole, getRoleDetail } from '../../../api/role'
import { getMenuTree } from '../../../api/menu'
import type { RolePayload, SysRoleRow } from '../../../types/role'
import CheckboxTree, { collectCheckedIds } from './CheckboxTree'

interface Props {
  isOpen: boolean
  editing: SysRoleRow | null
  onClose: () => void
}

const emptyForm = {
  roleName: '',
  roleKey: '',
  roleSort: '0',
  status: '0',
  remark: '',
}

export default function RoleFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const { data: menuTree } = useQuery({
    queryKey: ['menu-tree'],
    queryFn: getMenuTree,
    enabled: isOpen,
  })

  const { data: detail } = useQuery({
    queryKey: ['role-detail', editing?.role_id],
    queryFn: () => getRoleDetail(editing!.role_id),
    enabled: isOpen && !!editing,
  })

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setForm({
        roleName: editing.role_name,
        roleKey: editing.role_key,
        roleSort: String(editing.role_sort),
        status: editing.status,
        remark: editing.remark ?? '',
      })
      if (detail) setChecked(new Set(detail.menu_ids))
    } else {
      setForm(emptyForm)
      setChecked(new Set())
    }
  }, [isOpen, editing, detail])

  const handleSubmit = async () => {
    if (!form.roleName.trim() || !form.roleKey.trim()) {
      toast('提示', { description: '请填写角色名称和权限字符', variant: 'warning' })
      return
    }
    const payload: RolePayload = {
      roleName: form.roleName.trim(),
      roleKey: form.roleKey.trim(),
      roleSort: Number(form.roleSort) || 0,
      dataScope: editing?.data_scope ?? '1',
      status: form.status,
      remark: form.remark || undefined,
      menuIds: collectCheckedIds(menuTree ?? [], checked),
      deptIds: detail?.dept_ids ?? [],
    }
    setSaving(true)
    try {
      if (editing) {
        await editRole({ ...payload, roleId: editing.role_id })
        toast('成功', { description: '修改角色成功', variant: 'success' })
      } else {
        await addRole(payload)
        toast('成功', { description: '新增角色成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['role-list'] })
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
      title={editing ? '编辑角色' : '新增角色'}
      icon={ShieldCheck}
      size="lg"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基础信息">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            value={form.roleName}
            onChange={(v) => setForm((f) => ({ ...f, roleName: v }))}
            isRequired
          >
            <Label>角色名称</Label>
            <Input />
          </TextField>
          <TextField
            value={form.roleKey}
            onChange={(v) => setForm((f) => ({ ...f, roleKey: v }))}
            isRequired
          >
            <Label>权限字符</Label>
            <Input placeholder="如 admin" />
          </TextField>
          <TextField
            value={form.roleSort}
            onChange={(v) => setForm((f) => ({ ...f, roleSort: v }))}
          >
            <Label>显示顺序</Label>
            <Input inputMode="numeric" />
          </TextField>
        </div>
      </FormSection>

      <FormSection title="菜单权限">
        {menuTree ? (
          <CheckboxTree
            nodes={menuTree}
            checked={checked}
            onChange={setChecked}
            className="max-h-64 overflow-auto rounded-xl border border-accent/20 bg-accent-soft/60 p-3"
          />
        ) : (
          <div className="flex justify-center rounded-xl border border-accent/20 bg-accent-soft/60 py-6">
            <Spinner />
          </div>
        )}
      </FormSection>

      <FormSection title="状态与备注" tone="success">
        <div className="flex flex-col gap-4">
          <FormSwitch
            label="启用角色"
            isSelected={form.status === '0'}
            onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
          />
          <TextField
            value={form.remark}
            onChange={(v) => setForm((f) => ({ ...f, remark: v }))}
          >
            <Label>备注</Label>
            <TextArea rows={2} />
          </TextField>
        </div>
      </FormSection>
    </FormModal>
  )
}
