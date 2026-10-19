import { AlertDialog, Button } from '@heroui/react'
import { useModalBackdropVariant } from './useModalBackdrop'

interface Props {
  isOpen: boolean
  count: number
  label: string
  onClose: () => void
  onConfirm: () => void
}

export default function BatchDeleteDialog({ isOpen, count, label, onClose, onConfirm }: Props) {
  const backdropVariant = useModalBackdropVariant()

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialog.Backdrop variant={backdropVariant}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>批量删除{label}？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>确定删除选中的 {count} 条{label}吗？该操作不可撤销。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" size="sm" variant="tertiary">
                取消
              </Button>
              <Button slot="close" size="sm" variant="danger" onPress={onConfirm}>
                删除
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
