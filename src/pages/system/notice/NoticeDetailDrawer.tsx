import {
  Button,
  Chip,
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerDialog,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  DrawerRoot,
  useOverlayState,
} from '@heroui/react'
import { Megaphone } from 'lucide-react'
import RichTextEditor from '../../../components/editor/RichTextEditor'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import {
  NOTICE_STATUS_OPTIONS,
  NOTICE_TYPE_OPTIONS,
  optionLabel,
  type SysNoticeRow,
} from '../../../types/notice'

interface Props {
  notice: SysNoticeRow | null
  onClose: () => void
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

export default function NoticeDetailDrawer({ notice, onClose }: Props) {
  const state = useOverlayState({
    isOpen: notice !== null,
    onOpenChange: (open) => !open && onClose(),
  })
  const backdropVariant = useModalBackdropVariant()

  return (
    <DrawerRoot state={state}>
      <DrawerBackdrop variant={backdropVariant}>
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[92vw] sm:w-[560px]">
            <DrawerCloseTrigger />
            <DrawerHeader className="-mx-6 -mt-6 flex-row items-center gap-3 border-b border-separator/60 bg-linear-to-b from-accent-soft via-accent-soft/40 to-transparent px-6 pt-5 pb-4 pe-14">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                <Megaphone size={16} aria-hidden />
              </span>
              <DrawerHeading className="text-lg font-semibold">公告详情</DrawerHeading>
            </DrawerHeader>

            <DrawerBody className="flex flex-col gap-4 py-5">
              {notice && (
                <>
                  <div className="flex flex-col gap-2">
                    <h3 className="cursor-default text-base leading-6 font-semibold text-foreground select-none">
                      {notice.notice_title}
                    </h3>
                    <div className="flex cursor-default flex-wrap items-center gap-2 text-[13px] text-muted select-none">
                      <Chip
                        color={notice.notice_type === '1' ? 'warning' : 'success'}
                        size="sm"
                        variant="soft"
                      >
                        {optionLabel(NOTICE_TYPE_OPTIONS, notice.notice_type)}
                      </Chip>
                      <Chip
                        color={notice.status === '0' ? 'success' : 'danger'}
                        size="sm"
                        variant="soft"
                      >
                        {optionLabel(NOTICE_STATUS_OPTIONS, notice.status)}
                      </Chip>
                      <span className="text-foreground/70">{notice.create_by || '—'}</span>
                      <span aria-hidden>·</span>
                      <span>{formatTime(notice.create_time)}</span>
                    </div>
                  </div>

                  <RichTextEditor
                    key={notice.notice_id}
                    defaultValue={notice.notice_content ?? ''}
                    editable={false}
                    showToolbar={false}
                    showFooter={false}
                    placeholder=""
                    className="max-h-[56vh]"
                  />

                  {notice.remark ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="cursor-default text-xs font-medium text-muted select-none">
                        备注
                      </span>
                      <p className="cursor-default rounded-xl border border-separator bg-surface-secondary px-3 py-2 text-[13px] leading-5 break-all text-foreground select-none">
                        {notice.remark}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </DrawerBody>

            <DrawerFooter className="-mx-6 -mb-6 border-t border-separator/60 px-6 pt-4 pb-6">
              <Button variant="tertiary" size="sm" onPress={onClose}>
                关闭
              </Button>
            </DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </DrawerRoot>
  )
}
