import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Label,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  Radio,
  RadioContent,
  RadioControl,
  RadioGroup,
  RadioIndicator,
  Spinner,
  toast,
  useOverlayState,
} from '@heroui/react'
import { editRoleDataScope } from '../../../api/role'
import { getRoleDeptTree } from '../../../api/menu'
import { getDeptList } from '../../../api/dept'
import type { SysRoleRow } from '../../../types/role'
import type { SysDeptRow } from '../../../types/dept'
import CheckboxTree, { collectCheckedIds, expandCheckedKeys, type TreeOption } from './CheckboxTree'

interface Props {
  isOpen: boolean
  role: SysRoleRow | null
  onClose: () => void
}

const SCOPE_OPTIONS = [
  { value: '1', label: '全部数据权限' },
  { value: '2', label: '自定数据权限' },
  { value: '3', label: '本部门数据权限' },
  { value: '4', label: '本部门及以下数据权限' },
  { value: '5', label: '仅本人数据权限' },
]

function toTreeOptions(rows: SysDeptRow[]): TreeOption[] {
  return rows.map((row) => ({
    id: row.dept_id,
    label: row.dept_name,
    children: row.children?.length ? toTreeOptions(row.children) : undefined,
  }))
}

export default function DataScopeModal({ isOpen, role, onClose }: Props) {
  const queryClient = useQueryClient()
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const [scope, setScope] = useState('1')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const { data: deptTree } = useQuery({
    queryKey: ['dept-list', {}],
    queryFn: () => getDeptList(),
    enabled: isOpen,
  })

  const { data: roleDeptIds } = useQuery({
    queryKey: ['role-dept-tree', role?.role_id],
    queryFn: () => getRoleDeptTree(role!.role_id),
    enabled: isOpen && !!role && scope === '2',
  })

  useEffect(() => {
    if (!isOpen || !role) return
    setScope(role.data_scope ?? '1')
  }, [isOpen, role])

  useEffect(() => {
    if (scope !== '2') setChecked(new Set())
  }, [scope])

  useEffect(() => {
    if (!isOpen || !role || scope !== '2' || !roleDeptIds) return
    setChecked(expandCheckedKeys(toTreeOptions(deptTree ?? []), roleDeptIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, role, scope, roleDeptIds])

  const handleSave = async () => {
    if (!role) return
    setSaving(true)
    try {
      await editRoleDataScope(
        role,
        scope,
        scope === '2' ? collectCheckedIds(toTreeOptions(deptTree ?? []), checked) : [],
      )
      toast('成功', { description: '数据权限修改成功', variant: 'success' })
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
        <ModalContainer size="md">
          <ModalDialog>
            <ModalHeader>数据权限 — {role?.role_name}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <RadioGroup
                aria-label="数据权限范围"
                value={scope}
                onChange={(v: string) => setScope(v)}
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <Radio key={opt.value} value={opt.value}>
                    <RadioContent>
                      <RadioControl>
                        <RadioIndicator />
                      </RadioControl>
                      {opt.label}
                    </RadioContent>
                  </Radio>
                ))}
              </RadioGroup>
              {scope === '2' && (
                <div>
                  <Label className="mb-2 block">部门权限</Label>
                  {deptTree ? (
                    <CheckboxTree
                      nodes={toTreeOptions(deptTree)}
                      checked={checked}
                      onChange={setChecked}
                      className="max-h-56 overflow-auto rounded-xl border border-separator p-3"
                    />
                  ) : (
                    <div className="flex justify-center rounded-xl border border-separator py-6">
                      <Spinner />
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onClose}>
                取消
              </Button>
              <Button variant="primary" isPending={saving} onPress={handleSave}>
                保存
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  )
}
