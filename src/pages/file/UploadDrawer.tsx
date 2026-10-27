// 上传 Drawer：多选/拖拽上传、分片进度、暂停续传、断点恢复（F4）
// 队列为模块级单例（uploadManager.UploadQueue），Drawer 开关与恢复扫描共享同一实例
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerDialog,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  DrawerRoot,
  Label,
  ListBox,
  ListBoxItem,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useOverlayState,
} from '@heroui/react'
import {
  CheckCircle2,
  CircleAlert,
  Pause,
  Play,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react'
import { abortUploadSession } from '../../api/file'
import FolderTreePicker from './FolderTreePicker'
import { UploadQueue, fmtBytes } from '../../lib/uploadManager'
import type { UploadQueueSnapshot, UploadTask } from '../../lib/uploadManager'
import type { FileFolder, FileVisibility, UploadSessionStatus } from '../../types/file'
import { useModalBackdropVariant } from '../../components/useModalBackdrop'

interface Props {
  isOpen: boolean
  onClose: () => void
  folderId: number
  folders: FileFolder[]
  onUploaded?: () => void
}

const VISIBILITY_OPTIONS: { id: FileVisibility; label: string }[] = [
  { id: 'private', label: '私有' },
  { id: 'public', label: '公开' },
]

// 模块级单例：断点恢复扫描与任务列表共享同一队列；导出供文件页树面板拖入上传复用
const allDoneHolder: { current?: () => void } = {}
export const uploadQueue = new UploadQueue(() => allDoneHolder.current?.())

/** 订阅队列 snapshot 到 React state；高频进度 emit 做尾随合并（120ms）防渲染风暴 */
function useUploadQueueSnapshot(onAllDone?: () => void) {
  const [snap, setSnap] = useState<UploadQueueSnapshot>(() => uploadQueue.getSnapshot())
  const cbRef = useRef(onAllDone)
  useEffect(() => {
    cbRef.current = onAllDone
  })
  useEffect(() => {
    allDoneHolder.current = () => cbRef.current?.()
    let timer: ReturnType<typeof setTimeout> | null = null
    let latest: UploadQueueSnapshot | null = null
    const unsubscribe = uploadQueue.subscribe((s) => {
      if (timer) {
        latest = s
        return
      }
      // 首次回调与 store 当前快照一致，直接同步避免多余渲染
      setSnap(s)
      timer = setTimeout(() => {
        timer = null
        // latest 必须消费后清空：否则下一次尾随会把过期快照重新 setSnap，
        // 将 UI 回滚到旧状态（表现为上传卡在「合并中」）
        if (latest) {
          setSnap(latest)
          latest = null
        }
      }, 120)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])
  return snap
}

function statusView(t: UploadTask) {
  switch (t.status) {
    case 'done':
      return (
        <span className="flex shrink-0 items-center gap-1 text-xs text-success">
          <CheckCircle2 size={12} aria-hidden />
          完成
        </span>
      )
    case 'error':
      return (
        <Tooltip>
          <TooltipTrigger>
            <span className="flex shrink-0 items-center gap-1 text-xs text-danger">
              <CircleAlert size={12} aria-hidden />
              失败
            </span>
          </TooltipTrigger>
          <TooltipContent>{t.error ?? '上传失败'}</TooltipContent>
        </Tooltip>
      )
    case 'paused':
      return <span className="shrink-0 text-xs text-warning">已暂停</span>
    case 'canceled':
      return <span className="shrink-0 text-xs text-muted">已取消</span>
    case 'completing':
      return <span className="shrink-0 text-xs text-muted">合并中…</span>
    case 'uploading':
      return <span className="shrink-0 text-xs text-muted">{fmtBytes(t.speed)}/s</span>
    default:
      return <span className="shrink-0 text-xs text-muted">等待中</span>
  }
}

export default function UploadDrawer({ isOpen, onClose, folderId, folders, onUploaded }: Props) {
  // 关闭时刷新断点恢复列表（F3 裁决：close 触发 refreshRecover）
  const handleClose = () => {
    onClose()
    void uploadQueue.refreshRecover()
  }
  const state = useOverlayState({
    isOpen,
    onOpenChange: (open) => {
      if (!open) handleClose()
    },
  })
  const backdropVariant = useModalBackdropVariant()
  const snap = useUploadQueueSnapshot(() => {
    toast('成功', { description: '文件上传完成', variant: 'success' })
    onUploaded?.()
  })
  const [visibility, setVisibility] = useState<FileVisibility>('private')
  const [targetFolder, setTargetFolder] = useState(folderId)
  const [dragOver, setDragOver] = useState(false)
  const [recoverTarget, setRecoverTarget] = useState<UploadSessionStatus | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recoverInputRef = useRef<HTMLInputElement>(null)

  // 打开时扫描可恢复会话，并把目标目录重置为当前所在目录
  useEffect(() => {
    if (isOpen) {
      void uploadQueue.refreshRecover()
      setTargetFolder(folderId)
    }
  }, [isOpen, folderId])

  // folderId/targetFolder/visibility 在入队时随任务固化，后续上传使用任务自身值
  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return
    uploadQueue.addFiles(Array.from(list), targetFolder, visibility)
  }

  const canPauseAll = snap.tasks.some(
    (t) => (t.status === 'uploading' || t.status === 'queued') && t.mode !== 'single',
  )
  const canResumeAll = snap.tasks.some((t) => t.status === 'paused' && t.mode !== 'single')
  const finishedCount = snap.tasks.filter(
    (t) => t.status === 'done' || t.status === 'canceled' || t.status === 'error',
  ).length

  return (
    <DrawerRoot state={state}>
      <DrawerBackdrop variant={backdropVariant}>
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[92vw] sm:w-[480px]">
            <DrawerCloseTrigger />
            <DrawerHeader className="-mx-6 -mt-6 flex-row items-center gap-3 border-b border-separator/60 bg-linear-to-b from-accent-soft via-accent-soft/40 to-transparent px-6 pt-5 pb-4 pe-14">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                <UploadCloud size={16} aria-hidden />
              </span>
              <DrawerHeading className="text-lg font-semibold">上传文件</DrawerHeading>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-4 py-5">
              {/* 断点恢复区：仅 multipart 可继续，single 提示重新上传（F2 裁决） */}
              {snap.recoverSessions.length > 0 && (
                <section className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft/30 p-3">
                  <p className="text-xs font-medium">
                    检测到 {snap.recoverSessions.length} 个未完成上传（刷新前遗留）
                  </p>
                  {snap.recoverSessions.map((s) => (
                    <div key={s.session_id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        {s.file_name}（{fmtBytes(s.file_size)}）
                      </span>
                      {s.mode === 'multipart' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7!"
                          onPress={() => {
                            // 在用户手势内先记目标再打开文件选择，选定后校验同名同大小
                            setRecoverTarget(s)
                            recoverInputRef.current?.click()
                          }}
                        >
                          继续
                        </Button>
                      ) : (
                        <span className="text-muted">需重新上传</span>
                      )}
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="h-7!"
                        isIconOnly
                        aria-label="放弃该会话"
                        onPress={async () => {
                          try {
                            await abortUploadSession(s.session_id)
                          } catch {
                            /* 会话可能已过期 */
                          }
                          void uploadQueue.refreshRecover()
                        }}
                      >
                        <X size={12} className="size-3!" />
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              {/* 拖拽区 */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  pickFiles(e.dataTransfer.files)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 transition-colors ${
                  dragOver ? 'border-accent bg-accent-soft/40' : 'border-separator hover:bg-surface-secondary'
                }`}
              >
                <UploadCloud size={20} aria-hidden className="text-muted" />
                <p className="text-xs">点击选择或拖拽文件到此处（可多选）</p>
              </div>
              {/* 目标目录 + 可见性 */}
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs font-medium text-muted">目录</Label>
                <div className="min-w-0 flex-1">
                  <FolderTreePicker folders={folders} value={targetFolder} onChange={setTargetFolder} />
                </div>
                <Label className="shrink-0 text-xs font-medium text-muted">可见性</Label>
                <SelectRoot
                  aria-label="可见性"
                  className="w-28 shrink-0"
                  selectedKey={visibility}
                  onSelectionChange={(key) => {
                    if (key) setVisibility(key as FileVisibility)
                  }}
                >
                  <SelectTrigger className="min-h-8!">
                    <SelectValue className="text-xs!" />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {VISIBILITY_OPTIONS.map((o) => (
                        <ListBoxItem key={o.id} id={o.id}>
                          {o.label}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
              </div>
              {/* 批量操作 */}
              <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={!canPauseAll}
                    onPress={() => uploadQueue.pauseAll()}
                  >
                    全部暂停
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={!canResumeAll}
                    onPress={() => uploadQueue.resumeAll()}
                  >
                    全部继续
                  </Button>
                  {finishedCount > 0 && (
                    <Button size="sm" variant="tertiary" onPress={() => uploadQueue.clearDone()}>
                      清空已结束
                    </Button>
                  )}
                </div>
              {/* 任务列表 */}
              <div className="flex flex-col gap-2">
                {snap.tasks.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted">暂无上传任务</p>
                )}
                {snap.tasks.map((t) => (
                  <div key={t.id} className="flex flex-col gap-1.5 rounded-lg border border-separator p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.fileName}</span>
                      <span className="shrink-0 text-xs text-muted">{fmtBytes(t.fileSize)}</span>
                      {statusView(t)}
                      {/* single 模式无法续传（F2 裁决）：隐藏暂停按钮 */}
                      {(t.status === 'uploading' || t.status === 'queued') && t.mode !== 'single' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              size="sm"
                              variant="tertiary"
                              isIconOnly
                              className="size-6! rounded-full!"
                              aria-label="暂停"
                              onPress={() => uploadQueue.pause(t.id)}
                            >
                              <Pause size={12} className="size-3!" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>暂停</TooltipContent>
                        </Tooltip>
                      )}
                      {t.status === 'paused' && t.mode !== 'single' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              size="sm"
                              variant="tertiary"
                              isIconOnly
                              className="size-6! rounded-full!"
                              aria-label="继续"
                              onPress={() => uploadQueue.resume(t.id)}
                            >
                              <Play size={12} className="size-3!" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>继续</TooltipContent>
                        </Tooltip>
                      )}
                      {/* 仅失败任务可重试 */}
                      {t.status === 'error' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              size="sm"
                              variant="tertiary"
                              isIconOnly
                              className="size-6! rounded-full!"
                              aria-label="重试"
                              onPress={() => uploadQueue.retry(t.id)}
                            >
                              <Play size={12} className="size-3!" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>重试</TooltipContent>
                        </Tooltip>
                      )}
                      {t.status !== 'done' && t.status !== 'canceled' && (
                        <Button
                          size="sm"
                          variant="tertiary"
                          isIconOnly
                          className="size-6! rounded-full!"
                          aria-label="取消"
                          onPress={() => void uploadQueue.cancel(t.id)}
                        >
                          <XCircle size={12} className="size-3!" />
                        </Button>
                      )}
                      {(t.status === 'done' || t.status === 'canceled' || t.status === 'error') && (
                        <Button
                          size="sm"
                          variant="tertiary"
                          isIconOnly
                          className="size-6! rounded-full!"
                          aria-label="移除"
                          onPress={() => uploadQueue.remove(t.id)}
                        >
                          <X size={12} className="size-3!" />
                        </Button>
                      )}
                    </div>
                    {/* 本机 @heroui/react 无 Progress 导出，用手写进度条（计划备注） */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-150"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted">
                      {t.progress}%
                      {t.mode === 'multipart' ? ` · 分片 ${t.uploaded.size}/${t.partCount}` : ''}
                      {t.error ? ` · ${t.error}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </DrawerBody>
            <DrawerFooter className="-mx-6 -mb-6 border-t border-separator/60 px-6 pt-4 pb-6">
              <Button
                variant="secondary"
                size="sm"
                className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
                onPress={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={12} className="size-3!" aria-hidden />
                选择文件
              </Button>
              <Button variant="tertiary" size="sm" onPress={handleClose}>
                收起（不取消任务）
              </Button>
            </DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          pickFiles(e.target.files)
          e.currentTarget.value = ''
        }}
      />
      {/* 恢复用文件选择：限单个文件，校验同名+同大小后 recover */}
      <input
        ref={recoverInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.currentTarget.value = ''
          const target = recoverTarget
          setRecoverTarget(null)
          if (!f || !target) return
          if (f.name !== target.file_name || f.size !== target.file_size) {
            toast('提示', { description: '请选择与原任务同名且同大小的文件', variant: 'warning' })
            return
          }
          uploadQueue.recover(f, target)
        }}
      />
    </DrawerRoot>
  )
}
