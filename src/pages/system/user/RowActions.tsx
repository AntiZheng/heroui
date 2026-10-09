import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Tooltip,
  addToast,
} from '@heroui/react'
import { changeStatus, deleteUsers, resetPwd } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import type { SysUserRow } from '../../../types/user'

interface Props {
  row: SysUserRow
  onEdit: (row: SysUserRow) => void
}

export default function RowActions({ row, onEdit }: Props) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState(row.status)
  const [resetOpen, setResetOpen] = useState(false)
  const [newPwd, setNewPwd] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-list'] })
    queryClient.invalidateQueries({ queryKey: ['user-total'] })
  }

  const handleDelete = async () => {
    if (!window.confirm(`确定删除用户「${row.user_name}」吗？`)) return
    try {
      await deleteUsers([row.user_id])
    } catch {
      return
    }
    addToast({ title: '成功', description: '删除成功', color: 'success' })
    invalidate()
  }

  const handleStatusToggle = async (checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await changeStatus(row, next)
      setStatus(next)
      addToast({ title: '成功', description: '状态修改成功', color: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  const handleResetPwd = async () => {
    if (!newPwd) {
      addToast({ title: '提示', description: '请输入新密码', color: 'warning' })
      return
    }
    try {
      await resetPwd(row.user_id, newPwd)
    } catch {
      return
    }
    addToast({ title: '成功', description: '密码已重置', color: 'success' })
    setResetOpen(false)
    setNewPwd('')
  }

  return (
    <div className="flex items-center gap-2">
      <Switch size="sm" isSelected={status === '0'} onValueChange={handleStatusToggle} aria-label="启用状态" />
      {hasPermission('system:user:edit') && (
        <Tooltip content="编辑">
          <Button size="sm" variant="light" onPress={() => onEdit(row)}>
            编辑
          </Button>
        </Tooltip>
      )}
      {hasPermission('system:user:resetPwd') && (
        <Tooltip content="重置密码">
          <Button size="sm" variant="light" onPress={() => setResetOpen(true)}>
            重置密码
          </Button>
        </Tooltip>
      )}
      {hasPermission('system:user:remove') && (
        <Button size="sm" variant="light" color="danger" onPress={handleDelete}>
          删除
        </Button>
      )}
      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader>重置密码 — {row.user_name}</ModalHeader>
          <ModalBody>
            <Input
              label="新密码"
              type="password"
              value={newPwd}
              onValueChange={setNewPwd}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setResetOpen(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleResetPwd}>
              确认重置
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
