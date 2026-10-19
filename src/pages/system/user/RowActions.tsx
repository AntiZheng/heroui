import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, SquarePen, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  Button,
  Input,
  Label,
  TextField,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@heroui/react'
import { deleteUsers, resetPwd } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import type { SysUserRow } from '../../../types/user'
import FormModal from '../../../components/FormModal'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'

interface Props {
  row: SysUserRow
  onEdit: (row: SysUserRow) => void
}

export default function RowActions({ row, onEdit }: Props) {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [resetOpen, setResetOpen] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-list'] })
    queryClient.invalidateQueries({ queryKey: ['user-total'] })
  }

  const handleDelete = async () => {
    try {
      await deleteUsers([row.user_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    invalidate()
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
    setResetOpen(false)
    setNewPwd('')
  }

  return (
    <div className="flex items-center gap-1">
      {hasPermission('system:user:edit') && (
        <Tooltip>
          <TooltipTrigger>
            <Button size="sm" variant="tertiary" isIconOnly className="rounded-full!" onPress={() => onEdit(row)} aria-label="编辑">
              <SquarePen size={12} className="size-3!" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
      )}
      {hasPermission('system:user:resetPwd') && (
        <Tooltip>
          <TooltipTrigger>
            <Button size="sm" variant="tertiary" isIconOnly className="rounded-full!" onPress={() => setResetOpen(true)} aria-label="重置密码">
              <KeyRound size={12} className="size-3!" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重置密码</TooltipContent>
        </Tooltip>
      )}
      {hasPermission('system:user:remove') && (
        <>
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="sm"
                variant="danger-soft"
                isIconOnly
                className="rounded-full!"
                onPress={() => setDeleteOpen(true)}
                aria-label="删除"
              >
                <Trash2 size={12} className="size-3!" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
          <AlertDialog
            isOpen={deleteOpen}
            onOpenChange={(isOpen) => {
              if (!isOpen) setDeleteOpen(false)
            }}
          >
            <AlertDialog.Backdrop variant={backdropVariant}>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[400px]">
                  <AlertDialog.CloseTrigger />
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="danger" />
                    <AlertDialog.Heading>删除用户？</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>
                    <p>确定删除用户「{row.user_name}」吗？该操作不可撤销。</p>
                  </AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button slot="close" size="sm" variant="tertiary">
                      取消
                    </Button>
                    <Button slot="close" size="sm" variant="danger" onPress={handleDelete}>
                      删除
                    </Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        </>
      )}
      <FormModal
        isOpen={resetOpen}
        onClose={() => {
          setResetOpen(false)
          setNewPwd('')
        }}
        title="重置密码"
        meta={`用户：${row.user_name}`}
        icon={KeyRound}
        tone="danger"
        size="sm"
        onSubmit={handleResetPwd}
        submitLabel="确认重置"
      >
        <TextField value={newPwd} onChange={setNewPwd}>
          <Label>新密码</Label>
          <Input type="password" />
        </TextField>
      </FormModal>
    </div>
  )
}
