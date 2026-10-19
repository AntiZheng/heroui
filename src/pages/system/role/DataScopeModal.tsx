import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Radio,
  RadioContent,
  RadioControl,
  RadioGroup,
  RadioIndicator,
  Spinner,
  toast,
} from '@heroui/react'
import { LockKeyhole } from 'lucide-react'
import { editRoleDataScope } from '../../../api/role'
import { getRoleDeptTree } from '../../../api/menu'
import { getDeptList } from '../../../api/dept'
import type { SysRoleRow } from '../../../types/role'
import type { SysDeptRow } from '../../../types/dept'
import FormModal from '../../../components/FormModal'
import { FormSection } from '../../../components/FormSection'
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
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title="数据权限"
      meta={`角色：${role?.role_name ?? ''}`}
      icon={LockKeyhole}
      size="md"
      saving={saving}
      onSubmit={handleSave}
    >
      <FormSection title="权限范围">
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
      </FormSection>
      {scope === '2' && (
        <FormSection title="部门权限">
          {deptTree ? (
            <CheckboxTree
              nodes={toTreeOptions(deptTree)}
              checked={checked}
              onChange={setChecked}
              className="max-h-56 overflow-auto rounded-xl border border-accent/20 bg-accent-soft/60 p-3"
            />
          ) : (
            <div className="flex justify-center rounded-xl border border-accent/20 bg-accent-soft/60 py-6">
              <Spinner />
            </div>
          )}
        </FormSection>
      )}
    </FormModal>
  )
}
