import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  addToast,
} from '@heroui/react'
import { addUser, editUser, getDeptTree } from '../../../api/user'
import { flattenDeptTree } from './deptTree'
import type { SysUserRow, UserPayload } from '../../../types/user'

interface Props {
  isOpen: boolean
  editing: SysUserRow | null
  onClose: () => void
}

const emptyForm = {
  userName: '',
  nickName: '',
  password: '',
  deptId: new Set<string>(),
  phonenumber: '',
  email: '',
  status: '0',
}

export default function UserFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const { data: deptTreeData } = useQuery({ queryKey: ['dept-tree'], queryFn: getDeptTree })
  const deptOptions = useMemo(() => flattenDeptTree(deptTreeData ?? []), [deptTreeData])

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              userName: editing.user_name,
              nickName: editing.nick_name,
              password: '',
              deptId: new Set(editing.dept_id ? [String(editing.dept_id)] : []),
              phonenumber: editing.phonenumber ?? '',
              email: editing.email ?? '',
              status: editing.status,
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.userName || !form.nickName || form.deptId.size === 0) {
      addToast({ title: '提示', description: '请填写账号、昵称并选择部门', color: 'warning' })
      return
    }
    if (!editing && !form.password) {
      addToast({ title: '提示', description: '新增用户必须填写密码', color: 'warning' })
      return
    }
    setSaving(true)
    try {
      const payload: UserPayload = {
        userName: form.userName,
        nickName: form.nickName,
        deptId: Number(Array.from(form.deptId)[0]),
        roleIds: [],
        postIds: [],
        phonenumber: form.phonenumber || undefined,
        email: form.email || undefined,
        status: form.status,
      }
      if (editing) {
        await editUser({ ...payload, userId: editing.user_id })
        addToast({ title: '成功', description: '修改成功', color: 'success' })
      } else {
        await addUser({ ...payload, password: form.password })
        addToast({ title: '成功', description: '新增成功', color: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['user-list'] })
      queryClient.invalidateQueries({ queryKey: ['user-total'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>{editing ? '编辑用户' : '新增用户'}</ModalHeader>
        <ModalBody className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="账号"
              value={form.userName}
              onValueChange={(v) => setForm((f) => ({ ...f, userName: v }))}
              isDisabled={!!editing}
            />
            <Input
              label="昵称"
              value={form.nickName}
              onValueChange={(v) => setForm((f) => ({ ...f, nickName: v }))}
            />
            {!editing && (
              <Input
                label="密码"
                type="password"
                value={form.password}
                onValueChange={(v) => setForm((f) => ({ ...f, password: v }))}
              />
            )}
            <Input
              label="手机号"
              value={form.phonenumber}
              onValueChange={(v) => setForm((f) => ({ ...f, phonenumber: v }))}
            />
            <Input
              label="邮箱"
              value={form.email}
              onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            <Select
              label="部门"
              selectedKeys={form.deptId}
              onSelectionChange={(keys) => setForm((f) => ({ ...f, deptId: new Set(Array.from(keys as Set<string>)) }))}
            >
              {deptOptions.map((dept) => (
                <SelectItem key={String(dept.id)}>{dept.label}</SelectItem>
              ))}
            </Select>
          </div>
          <Switch
            isSelected={form.status === '0'}
            onValueChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
          >
            状态正常
          </Switch>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            取消
          </Button>
          <Button color="primary" isLoading={saving} onPress={handleSubmit}>
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
