import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  Spinner,
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  TextField,
  TextArea,
  toast,
  useOverlayState,
} from '@heroui/react'
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
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
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
    <ModalRoot state={state}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>{editing ? '编辑角色' : '新增角色'}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
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
              <div>
                <Label className="mb-2 block">菜单权限</Label>
                {menuTree ? (
                  <CheckboxTree
                    nodes={menuTree}
                    checked={checked}
                    onChange={setChecked}
                    className="max-h-64 overflow-auto rounded-xl border border-separator p-3"
                  />
                ) : (
                  <div className="flex justify-center rounded-xl border border-separator py-6">
                    <Spinner />
                  </div>
                )}
              </div>
              <TextField
                value={form.remark}
                onChange={(v) => setForm((f) => ({ ...f, remark: v }))}
              >
                <Label>备注</Label>
                <TextArea rows={2} />
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
