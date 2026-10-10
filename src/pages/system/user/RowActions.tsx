import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  TextField,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useOverlayState,
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
  const resetState = useOverlayState()
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
    toast('成功', { description: '删除成功', variant: 'success' })
    invalidate()
  }

  const handleStatusToggle = async (checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await changeStatus(row, next)
      setStatus(next)
      toast('成功', { description: '状态修改成功', variant: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  const handleResetPwd = async () => {
    if (!newPwd) {
      toast('提示', { description: '请输入新密码', variant: 'warning' })
      return
    }
    try {
      await resetPwd(row.user_id, newPwd)
    } catch {
      return
    }
    toast('成功', { description: '密码已重置', variant: 'success' })
    resetState.close()
    setNewPwd('')
  }

  return (
    <div className="flex items-center gap-2">
      <Switch isSelected={status === '0'} onChange={handleStatusToggle} aria-label="启用状态">
        <SwitchContent>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
        </SwitchContent>
      </Switch>
      {hasPermission('system:user:edit') && (
        <Tooltip>
          <TooltipTrigger>
            <Button size="sm" variant="ghost" onPress={() => onEdit(row)}>
              编辑
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
      )}
      {hasPermission('system:user:resetPwd') && (
        <Tooltip>
          <TooltipTrigger>
            <Button size="sm" variant="ghost" onPress={resetState.open}>
              重置密码
            </Button>
          </TooltipTrigger>
          <TooltipContent>重置密码</TooltipContent>
        </Tooltip>
      )}
      {hasPermission('system:user:remove') && (
        <Button size="sm" variant="danger-soft" onPress={handleDelete}>
          删除
        </Button>
      )}
      <ModalRoot state={resetState}>
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              <ModalHeader>重置密码 — {row.user_name}</ModalHeader>
              <ModalBody>
                <TextField value={newPwd} onChange={setNewPwd}>
                  <Label>新密码</Label>
                  <Input type="password" />
                </TextField>
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={resetState.close}>
                  取消
                </Button>
                <Button variant="primary" onPress={handleResetPwd}>
                  确认重置
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </div>
  )
}
