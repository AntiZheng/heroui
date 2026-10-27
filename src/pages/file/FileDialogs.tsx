import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
  Button,
  EmptyState,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ModalBackdrop,
  ModalBody,
  ModalCloseTrigger,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalRoot,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextField,
  Typography,
  toast,
  useOverlayState,
} from '@heroui/react'
import {
  Download,
  File as FileIcon,
  FolderInput,
  FolderPlus,
  SquarePen,
} from 'lucide-react'
import { useModalBackdropVariant } from '../../components/useModalBackdrop'
import FormModal from '../../components/FormModal'
import {
  createFolder,
  getFileText,
  getFileUrls,
  updateFile,
  updateFolder,
} from '../../api/file'
import type { FileFolder, SysFileRow } from '../../types/file'

// ---------- 新建 / 重命名目录 ----------

interface FolderFormDialogProps {
  isOpen: boolean
  parentId: number
  /** 非空 = 重命名该目录 */
  editing: FileFolder | null
  onClose: () => void
}

export function FolderFormDialog({ isOpen, parentId, editing, onClose }: FolderFormDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) setName(editing?.folder_name ?? '')
  }, [isOpen, editing])

  const handleSubmit = async () => {
    const value = name.trim()
    if (!value) {
      toast('提示', { description: '请输入目录名称', variant: 'warning' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateFolder(editing.folder_id, { folderName: value })
        toast('成功', { description: '重命名目录成功', variant: 'success' })
      } else {
        await createFolder({ parentId, folderName: value })
        toast('成功', { description: '新建目录成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['file-folders'] })
      queryClient.invalidateQueries({ queryKey: ['file-list'] })
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
      title={editing ? '重命名目录' : '新建目录'}
      icon={FolderPlus}
      size="sm"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <TextField value={name} onChange={setName} isRequired>
        <Label>目录名称</Label>
        <Input placeholder="请输入目录名称" />
      </TextField>
    </FormModal>
  )
}

// ---------- 文件重命名（brief 未单独列出，补一个最小弹窗承接行操作「重命名」） ----------

interface FileRenameDialogProps {
  isOpen: boolean
  target: SysFileRow | null
  onClose: () => void
}

export function FileRenameDialog({ isOpen, target, onClose }: FileRenameDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) setName(target?.file_name ?? '')
  }, [isOpen, target])

  const handleSubmit = async () => {
    if (!target) return
    const value = name.trim()
    if (!value) {
      toast('提示', { description: '请输入文件名称', variant: 'warning' })
      return
    }
    setSaving(true)
    try {
      await updateFile(target.file_id, { fileName: value })
      toast('成功', { description: '重命名成功', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['file-list'] })
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
      title="重命名文件"
      icon={SquarePen}
      size="sm"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <TextField value={name} onChange={setName} isRequired>
        <Label>文件名称</Label>
        <Input placeholder="请输入文件名称" />
      </TextField>
    </FormModal>
  )
}

// ---------- 移动（文件 / 目录） ----------

interface MoveOption {
  id: number
  label: string
  depth: number
}

function buildMoveOptions(
  folders: FileFolder[],
  excludeId?: number,
  excludePathPrefix?: string,
): MoveOption[] {
  const out: MoveOption[] = []
  const walk = (parentId: number, depth: number) => {
    for (const f of folders.filter((x) => x.parent_id === parentId)) {
      if (f.folder_id === excludeId) continue
      if (
        excludePathPrefix &&
        (f.folder_path === excludePathPrefix || f.folder_path.startsWith(`${excludePathPrefix}/`))
      )
        continue
      out.push({ id: f.folder_id, label: f.folder_path, depth })
      walk(f.folder_id, depth + 1)
    }
  }
  walk(0, 0)
  return out
}

interface MoveDialogProps {
  isOpen: boolean
  target: (SysFileRow | FileFolder) | null
  kind: 'file' | 'folder'
  folders: FileFolder[]
  onClose: () => void
}

export function MoveDialog({ isOpen, target, kind, folders, onClose }: MoveDialogProps) {
  const queryClient = useQueryClient()
  const [destId, setDestId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) setDestId(null)
  }, [isOpen])

  const options = useMemo(() => {
    if (!target) return []
    if (kind === 'folder' && 'folder_id' in target) {
      return buildMoveOptions(folders, target.folder_id, target.folder_path)
    }
    if (kind === 'file' && 'file_id' in target) {
      return buildMoveOptions(folders).filter((o) => o.id !== target.folder_id)
    }
    return buildMoveOptions(folders)
  }, [folders, kind, target])

  const handleSubmit = async () => {
    if (!target || destId == null) {
      toast('提示', { description: '请选择目标目录', variant: 'warning' })
      return
    }
    setSaving(true)
    try {
      if (kind === 'file' && 'file_id' in target) {
        await updateFile(target.file_id, { folderId: destId })
        toast('成功', { description: '移动文件成功', variant: 'success' })
      } else if ('folder_id' in target) {
        await updateFolder(target.folder_id, { parentId: destId })
        toast('成功', { description: '移动目录成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['file-folders'] })
      queryClient.invalidateQueries({ queryKey: ['file-list'] })
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
      title={kind === 'folder' ? '移动目录' : '移动文件'}
      icon={FolderInput}
      size="sm"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <SelectRoot
        aria-label="目标目录"
        selectedKey={destId}
        onSelectionChange={(key) => setDestId(key == null ? null : Number(key))}
      >
        <Label>目标目录</Label>
        <SelectTrigger>
          <SelectValue>
            {({ isPlaceholder, defaultChildren }) =>
              isPlaceholder ? <span className="text-muted">请选择目标目录</span> : defaultChildren
            }
          </SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            <ListBoxItem id={0}>全部文件（根目录）</ListBoxItem>
            {options.map((o) => (
              <ListBoxItem
                key={o.id}
                id={o.id}
                className="truncate"
                style={{ paddingInlineStart: 12 + o.depth * 16 }}
              >
                {o.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </SelectRoot>
    </FormModal>
  )
}

// ---------- 删除确认（单条：文件 / 目录） ----------

interface FileDeleteDialogProps {
  isOpen: boolean
  kind: 'file' | 'folder'
  names: string[]
  onClose: () => void
  onConfirm: () => void
}

export function FileDeleteDialog({ isOpen, kind, names, onClose, onConfirm }: FileDeleteDialogProps) {
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
              <AlertDialog.Heading>{kind === 'folder' ? '删除目录？' : '删除文件？'}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                确定删除「{names.join('、')}」吗？
                {kind === 'folder'
                  ? '目录下的子目录与文件将被一并删除，MinIO 中的文件对象不可恢复。'
                  : '将同时删除 MinIO 中的文件对象，不可恢复。'}
              </p>
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

// ---------- 批量删除确认（走 deleteFiles） ----------

interface BatchFileDeleteDialogProps {
  isOpen: boolean
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function BatchFileDeleteDialog({ isOpen, count, onClose, onConfirm }: BatchFileDeleteDialogProps) {
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
              <AlertDialog.Heading>批量删除文件？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>确定删除选中的 {count} 个文件吗？将同时删除 MinIO 中的文件对象，不可恢复。</p>
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

// ---------- 预览 ----------

const TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'log']

interface PreviewModalProps {
  target: SysFileRow | null
  onClose: () => void
}

export function PreviewModal({ target, onClose }: PreviewModalProps) {
  const state = useOverlayState({
    isOpen: target !== null,
    onOpenChange: (open) => !open && onClose(),
  })
  const backdropVariant = useModalBackdropVariant()

  const fileId = target?.file_id
  const ext = target?.file_ext?.toLowerCase() ?? ''
  const isPdf = ext === 'pdf' || (target?.mime_type ?? '').toLowerCase().includes('pdf')
  const isText = target?.category === 'document' && TEXT_EXTS.includes(ext)

  const {
    data: urlItems,
    isPending: urlPending,
  } = useQuery({
    queryKey: ['file-url', fileId],
    queryFn: () => getFileUrls([fileId as number]),
    enabled: fileId != null,
  })
  const url = urlItems?.[0]?.url

  const { data: textRes, isPending: textPending } = useQuery({
    queryKey: ['file-text', fileId],
    queryFn: () => getFileText(fileId as number),
    enabled: fileId != null && isText,
  })

  const handleDownload = async () => {
    if (!target) return
    try {
      const res = await getFileUrls([target.file_id], true)
      if (res[0]?.url) window.open(res[0].url)
    } catch {
      return
    }
  }

  const renderContent = () => {
    if (!target) return null
    if (urlPending) {
      return (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )
    }
    if (!url) {
      return (
        <EmptyState className="flex flex-col items-center justify-center gap-2 py-10">
          <FileIcon size={20} aria-hidden className="text-muted" />
          <Typography.Paragraph size="sm" color="muted">
            无法获取文件链接
          </Typography.Paragraph>
        </EmptyState>
      )
    }
    if (target.category === 'image') {
      return <img src={url} alt={target.file_name} className="mx-auto max-h-[70vh] object-contain" />
    }
    if (isPdf) {
      return <iframe src={url} title={target.file_name} className="h-[70vh] w-full rounded-lg border border-separator" />
    }
    if (target.category === 'video') {
      return <video src={url} controls className="mx-auto max-h-[70vh] w-full" />
    }
    if (target.category === 'audio') {
      return (
        <div className="py-12">
          <audio src={url} controls className="w-full" />
        </div>
      )
    }
    if (isText) {
      if (textPending) {
        return (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )
      }
      return (
        <div className="flex flex-col gap-2">
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-surface-secondary p-3 text-xs whitespace-pre-wrap">
            {textRes?.content ?? ''}
          </pre>
          {textRes?.truncated && (
            <p className="text-xs text-muted">文件内容过长，已截断显示，可下载查看完整内容。</p>
          )}
        </div>
      )
    }
    return (
      <EmptyState className="flex flex-col items-center justify-center gap-3 py-10">
        <FileIcon size={20} aria-hidden className="text-muted" />
        <Typography.Paragraph size="sm" color="muted">
          该文件类型暂不支持在线预览
        </Typography.Paragraph>
        <Button size="sm" variant="secondary" onPress={handleDownload}>
          <Download size={12} className="size-3!" aria-hidden />
          下载文件
        </Button>
      </EmptyState>
    )
  }

  return (
    <ModalRoot state={state}>
      <ModalBackdrop variant={backdropVariant}>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalCloseTrigger className="top-5" />
            <ModalHeader className="-mx-6 -mt-6 border-b border-separator/60 px-6 pt-5 pb-4 pe-14 bg-linear-to-b from-accent-soft via-accent-soft/40 to-transparent">
              <div className="flex min-w-0 cursor-default items-center gap-3 select-none">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                  <FileIcon size={16} aria-hidden />
                </span>
                <ModalHeading className="truncate text-lg font-semibold">
                  {target?.file_name ?? '预览'}
                </ModalHeading>
              </div>
            </ModalHeader>
            <ModalBody className="mt-4">{renderContent()}</ModalBody>
            <ModalFooter className="-mx-6 -mb-6 mt-4 gap-2 border-t border-separator/60 px-6 pt-4 pb-6">
              <Button variant="tertiary" size="sm" onPress={onClose}>
                关闭
              </Button>
              <Button variant="primary" size="sm" onPress={handleDownload} isDisabled={!target}>
                <Download size={12} className="size-3!" aria-hidden />
                下载
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  )
}
