import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Button,
  Chip,
  ModalBackdrop,
  ModalBody,
  ModalCloseTrigger,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalRoot,
  useOverlayState,
} from '@heroui/react'
import { useModalBackdropVariant } from './useModalBackdrop'

type Tone = 'accent' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
}

const HEADER_TINT: Record<Tone, string> = {
  accent: 'bg-linear-to-b from-accent-soft via-accent-soft/40 to-transparent',
  success: 'bg-linear-to-b from-success-soft via-success-soft/40 to-transparent',
  warning: 'bg-linear-to-b from-warning-soft via-warning-soft/40 to-transparent',
  danger: 'bg-linear-to-b from-danger-soft via-danger-soft/40 to-transparent',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  meta?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  saving?: boolean
  onSubmit?: () => void
  submitLabel?: string
  children: ReactNode
  footer?: ReactNode
}

export default function FormModal({
  isOpen,
  onClose,
  title,
  meta,
  icon: Icon,
  tone = 'accent',
  size = 'md',
  saving,
  onSubmit,
  submitLabel = '保存',
  children,
  footer,
}: Props) {
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const backdropVariant = useModalBackdropVariant()

  return (
    <ModalRoot state={state}>
      <ModalBackdrop variant={backdropVariant}>
        <ModalContainer size={size}>
          <ModalDialog>
            <ModalCloseTrigger className="top-5" />
            <ModalHeader
              className={`-mx-6 -mt-6 border-b border-separator/60 px-6 pt-5 pb-4 pe-14 ${HEADER_TINT[tone]}`}
            >
              <div className="flex items-center gap-3">
                {Icon && (
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}
                  >
                    <Icon size={16} aria-hidden />
                  </span>
                )}
                <div className="flex min-w-0 cursor-default flex-wrap items-center gap-x-2 gap-y-1 select-none">
                  <ModalHeading className="text-lg font-semibold">{title}</ModalHeading>
                  {meta && (
                    <Chip
                      color="default"
                      variant="soft"
                      size="sm"
                      className="h-5 cursor-default px-2 text-xs select-none"
                    >
                      {meta}
                    </Chip>
                  )}
                </div>
              </div>
            </ModalHeader>
            <ModalBody className="mt-4 flex flex-col gap-5 [&_.label]:cursor-default [&_.label]:text-xs [&_.label]:font-medium [&_.label]:text-muted [&_input:disabled]:bg-surface-secondary [&_input:disabled]:text-foreground [&_input:disabled]:opacity-100">
              {children}
            </ModalBody>
            <ModalFooter className="-mx-6 -mb-6 mt-4 gap-2 border-t border-separator/60 px-6 pt-4 pb-6">
              {footer ?? (
                <>
                  <Button variant="tertiary" size="sm" onPress={onClose}>
                    取消
                  </Button>
                  <Button variant="primary" size="sm" isPending={saving} onPress={onSubmit}>
                    {submitLabel}
                  </Button>
                </>
              )}
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  )
}
