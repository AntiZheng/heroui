import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Selection } from 'react-aria-components'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  SearchField,
  Spinner,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRoot,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
  toast,
} from '@heroui/react'
import {
  Download,
  Eye,
  Folder,
  FolderOpen,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  Link2,
  List,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  deleteFiles,
  deleteFolders,
  getFileFolders,
  getFileList,
  getFileUrls,
  updateFile,
  updateFolder,
} from '../../api/file'
import { hasPermission } from '../../stores/auth'
import { FILE_SOURCE_LABELS } from '../../types/file'
import type { FileFolder, SysFileRow } from '../../types/file'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../components/ColumnSettings'
import TableCornerOverlays from '../../components/TableCornerOverlays'
import SelectionCheckbox from '../../components/SelectionCheckbox'
import {
  CATEGORY_ICONS,
  CategoryChip,
  VisibilityChip,
  copyText,
  formatSize,
  formatTime,
} from './fileUtils'
import {
  BatchFileDeleteDialog,
  FileDeleteDialog,
  FileRenameDialog,
  FolderFormDialog,
  MoveDialog,
  PreviewModal,
} from './FileDialogs'
import UploadDrawer, { uploadQueue } from './UploadDrawer'
import FolderTreePanel, { MOVE_TYPE } from './FolderTreePanel'
import type { FolderDragPayload } from './FolderTreePanel'
import FileGrid from './FileGrid'
import type { FileGridAction, FileGridRow } from './FileGrid'

const PAGE_SIZE = 20

const columns = [
  { key: 'file_name', label: '名称' },
  { key: 'category', label: '类型' },
  { key: 'file_size', label: '大小' },
  { key: 'visibility', label: '可见性' },
  { key: 'source', label: '来源/上传者' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

type MergedRow = ({ kind: 'folder' } & FileFolder) | ({ kind: 'file' } & SysFileRow)

export default function FilePage() {
  const queryClient = useQueryClient()
  const [currentFolderId, setCurrentFolderId] = useState(0) // 0 = 全部文件
  const [view, setView] = useState<'table' | 'grid'>('grid')
  const [nameInput, setNameInput] = useState('')
  const [appliedName, setAppliedName] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [folderForm, setFolderForm] = useState<{
    open: boolean
    editing: FileFolder | null
    parentId?: number
  }>({ open: false, editing: null })
  const [renaming, setRenaming] = useState<SysFileRow | null>(null)
  const [moving, setMoving] = useState<{ kind: 'file' | 'folder'; row: SysFileRow | FileFolder } | null>(
    null,
  )
  const [preview, setPreview] = useState<SysFileRow | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'file' | 'folder'; names: string[]; ids: number[] } | null>(
    null,
  )
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const colCtrl = useColPrefs({ storageKey: 'file-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data: folders } = useQuery({
    queryKey: ['file-folders'],
    queryFn: getFileFolders,
  })

  const fileQuery = useInfiniteQuery({
    queryKey: ['file-list', currentFolderId, appliedName],
    queryFn: ({ pageParam }) =>
      getFileList({
        pageNum: pageParam,
        pageSize: PAGE_SIZE,
        folderId: currentFolderId || undefined,
        fileName: appliedName || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const totalPages = Math.max(1, Math.ceil(last.total / PAGE_SIZE))
      return last.pageNum < totalPages ? last.pageNum + 1 : undefined
    },
  })
  const isPending = fileQuery.isPending

  // 当前目录下的子目录（根目录取 parent_id === 0）
  const foldersInCurrent = useMemo(
    () => (folders ?? []).filter((f) => f.parent_id === currentFolderId),
    [folders, currentFolderId],
  )

  // 目录在前、文件在后合并成表格行（文件跨页平铺）
  const rows = useMemo<MergedRow[]>(
    () => [
      ...foldersInCurrent.map((f) => ({ kind: 'folder' as const, ...f })),
      ...(fileQuery.data?.pages.flatMap((p) => p.rows) ?? []).map((r) => ({
        kind: 'file' as const,
        ...r,
      })),
    ],
    [foldersInCurrent, fileQuery.data],
  )

  const rowId = (row: MergedRow) =>
    row.kind === 'folder' ? `folder-${row.folder_id}` : `file-${row.file_id}`

  // 仅统计勾选的文件行（目录不参与勾选/批量删除）
  const selectedFileIds = useMemo(() => {
    if (selected === 'all') {
      return rows.filter((r) => r.kind === 'file').map((r) => (r as { file_id: number }).file_id)
    }
    return Array.from(selected)
      .map(String)
      .filter((id) => id.startsWith('file-'))
      .map((id) => Number(id.slice(5)))
  }, [selected, rows])
  const batchCount = selectedFileIds.length

  // 搜索/切目录后清空勾选，避免残留选择
  useEffect(() => {
    setSelected(new Set())
  }, [appliedName, currentFolderId])

  const enterFolder = (folderId: number) => {
    setCurrentFolderId(folderId)
  }

  const searchByFileName = () => setAppliedName(nameInput.trim())

  // 清空输入时立即取消文件名过滤
  const handleNameChange = (value: string) => {
    setNameInput(value)
    if (!value && appliedName) setAppliedName('')
  }

  // 无限滚动：哨兵进入视口（含内层滚动容器）时加载下一页
  const { hasNextPage, fetchNextPage, isFetchingNextPage } = fileQuery
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage()
      },
      { rootMargin: '240px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, fetchNextPage])

  const invalidateFileData = () => {
    queryClient.invalidateQueries({ queryKey: ['file-list'] })
    queryClient.invalidateQueries({ queryKey: ['file-folders'] })
  }

  const editPerm = hasPermission('file:edit')
  const delPerm = hasPermission('file:delete')

  const handleTreeCreateChild = (parentId: number) =>
    setFolderForm({ open: true, editing: null, parentId })

  const handleDropMove = async (targetId: number, payload: FolderDragPayload) => {
    try {
      if (payload.kind === 'file') await updateFile(payload.id, { folderId: targetId })
      else await updateFolder(payload.id, { parentId: targetId })
    } catch {
      return
    }
    toast('成功', { description: '移动成功', variant: 'success' })
    invalidateFileData()
  }

  // 外部文件拖到树节点：以目标目录入队（可见性取默认私有）并打开上传抽屉展示进度
  const handleDropFiles = (targetId: number, files: File[]) => {
    uploadQueue.addFiles(files, targetId, 'private')
    setUploadOpen(true)
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      if (deleting.kind === 'file') await deleteFiles(deleting.ids)
      else await deleteFolders(deleting.ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    invalidateFileData()
  }

  const handleBatchDelete = async () => {
    if (batchCount === 0) return
    try {
      await deleteFiles(selectedFileIds)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    setBatchOpen(false)
    invalidateFileData()
  }

  const handleDownload = async (row: SysFileRow) => {
    try {
      const res = await getFileUrls([row.file_id], true)
      if (res[0]?.url) window.open(res[0].url)
    } catch {
      return
    }
  }

  const handleCopyLink = async (row: SysFileRow) => {
    try {
      const res = await getFileUrls([row.file_id])
      const item = res[0]
      if (!item?.url) return
      const suffix =
        !item.is_public && item.expires_at ? `，链接将于 ${item.expires_at} 过期` : ''
      // copyText 内含 clipboard → execCommand 回退 → 失败 toast（http 环境降级）
      await copyText(item.url, `链接已复制${suffix}`)
    } catch {
      return
    }
  }

  // 网格视图行操作：复用表格的处理函数（预览单独走 onPreview，目录打开走 onOpenFolder）
  const handleGridAction = (action: FileGridAction, row: FileGridRow) => {
    if (row.kind === 'folder') {
      if (action === 'open') enterFolder(row.folder_id)
      return
    }
    if (action === 'download') void handleDownload(row)
    else if (action === 'copy') void handleCopyLink(row)
    else if (action === 'delete')
      setDeleting({ kind: 'file', names: [row.file_name], ids: [row.file_id] })
  }

  // 文本列单行截断，悬浮显示完整内容
  const textCell = (value: unknown) => {
    const text = String(value ?? '—')
    const span = <span className="block max-w-[200px] truncate">{text}</span>
    if (value == null || value === '') return span
    return (
      <Tooltip>
        <TooltipTrigger>{span}</TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    )
  }

  const renderNameCell = (row: MergedRow) => {
    if (row.kind === 'folder') {
      return (
        <span
          className="flex items-center gap-1.5"
          onDoubleClick={() => enterFolder(row.folder_id)}
        >
          <Folder size={14} aria-hidden className="shrink-0 text-warning" />
          <span className="block max-w-[240px] truncate">{row.folder_name}</span>
        </span>
      )
    }
    const Icon = CATEGORY_ICONS[row.category]
    return (
      <span className="flex items-center gap-1.5">
        <Icon size={14} aria-hidden className="shrink-0 text-muted" />
        <span className="block max-w-[280px] truncate">{row.file_name}</span>
      </span>
    )
  }

  const renderSourceCell = (row: MergedRow) => {
    if (row.kind === 'folder') return textCell(null)
    const by = row.source === 'api' ? row.api_key_name : row.uploader_name
    return (
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span>{FILE_SOURCE_LABELS[row.source]}</span>
        {by ? <span className="text-xs text-muted">{by}</span> : null}
      </span>
    )
  }

  const renderCell = (row: MergedRow, key: string) => {
    switch (key) {
      case 'file_name': {
        // 名称单元格承载行拖拽（TableRow 不透传原生 drag 属性），拖到左侧树节点移动
        const dragId = row.kind === 'folder' ? row.folder_id : row.file_id
        return (
          <span
            draggable={row.kind === 'file' || row.is_system !== 1}
            onDragStart={(e: React.DragEvent) => {
              e.dataTransfer.setData(MOVE_TYPE, JSON.stringify({ kind: row.kind, id: dragId }))
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            {renderNameCell(row)}
          </span>
        )
      }
      case 'category':
        return row.kind === 'file' ? <CategoryChip category={row.category} /> : textCell(null)
      case 'file_size':
        return textCell(row.kind === 'file' ? formatSize(row.file_size) : null)
      case 'visibility':
        return row.kind === 'file' ? <VisibilityChip visibility={row.visibility} /> : textCell(null)
      case 'source':
        return renderSourceCell(row)
      case 'create_time':
        return textCell(formatTime(row.kind === 'file' ? row.create_time : null))
      case 'actions': {
        const iconBtn = (
          label: string,
          icon: ReactNode,
          onPress: () => void,
          variant: 'tertiary' | 'danger-soft' = 'tertiary',
        ) => (
          <Tooltip>
            <TooltipTrigger>
              <Button size="sm" variant={variant} isIconOnly className="rounded-full!" onPress={onPress} aria-label={label}>
                {icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
        if (row.kind === 'folder') {
          const canManage = row.is_system !== 1
          return (
            <div className="flex items-center gap-1">
              {iconBtn(
                '打开',
                <FolderOpen size={12} className="size-3!" aria-hidden />,
                () => enterFolder(row.folder_id),
              )}
              {editPerm &&
                canManage &&
                iconBtn(
                  '重命名',
                  <SquarePen size={12} className="size-3!" aria-hidden />,
                  () => setFolderForm({ open: true, editing: row }),
                )}
              {editPerm &&
                canManage &&
                iconBtn(
                  '移动',
                  <FolderInput size={12} className="size-3!" aria-hidden />,
                  () => setMoving({ kind: 'folder', row }),
                )}
              {delPerm &&
                canManage &&
                iconBtn(
                  '删除',
                  <Trash2 size={12} className="size-3!" aria-hidden />,
                  () =>
                    setDeleting({
                      kind: 'folder',
                      names: [row.folder_name],
                      ids: [row.folder_id],
                    }),
                  'danger-soft',
                )}
            </div>
          )
        }
        const canDownload = hasPermission('file:download')
        return (
          <div className="flex items-center gap-1">
            {canDownload &&
              iconBtn(
                '预览',
                <Eye size={12} className="size-3!" aria-hidden />,
                () => setPreview(row),
              )}
            {canDownload &&
              iconBtn(
                '下载',
                <Download size={12} className="size-3!" aria-hidden />,
                () => void handleDownload(row),
              )}
            {canDownload &&
              iconBtn(
                '复制链接',
                <Link2 size={12} className="size-3!" aria-hidden />,
                () => void handleCopyLink(row),
              )}
            {editPerm &&
              iconBtn(
                '重命名',
                <SquarePen size={12} className="size-3!" aria-hidden />,
                () => setRenaming(row),
              )}
            {editPerm &&
              iconBtn(
                '移动',
                <FolderInput size={12} className="size-3!" aria-hidden />,
                () => setMoving({ kind: 'file', row }),
              )}
            {delPerm &&
              iconBtn(
                '删除',
                <Trash2 size={12} className="size-3!" aria-hidden />,
                () =>
                  setDeleting({ kind: 'file', names: [row.file_name], ids: [row.file_id] }),
                'danger-soft',
              )}
          </div>
        )
      }
      default:
        return textCell((row as unknown as Record<string, unknown>)[key])
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-6">
      <FolderTreePanel
        folders={folders ?? []}
        currentFolderId={currentFolderId}
        editPerm={editPerm}
        delPerm={delPerm}
        onSelect={enterFolder}
        onCreateChild={handleTreeCreateChild}
        onEdit={(folder) => setFolderForm({ open: true, editing: folder })}
        onDelete={(folder) =>
          setDeleting({ kind: 'folder', names: [folder.folder_name], ids: [folder.folder_id] })
        }
        onDropMove={(targetId, payload) => void handleDropMove(targetId, payload)}
        onDropFiles={handleDropFiles}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
      {/* 标题行：搜索框 + 操作按钮 */}
      <div className="flex items-center justify-between gap-3">
        <SearchField
          aria-label="按文件名搜索"
          value={nameInput}
          onChange={handleNameChange}
          onSubmit={searchByFileName}
          className="w-48"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索文件名，回车确认" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <div className="flex items-center gap-2">
          {hasPermission('file:upload') && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={() => setUploadOpen(true)}
            >
              <Upload size={12} className="size-3!" aria-hidden />
              上传
            </Button>
          )}
          {hasPermission('file:edit') && (
            <Button variant="secondary" size="sm" onPress={() => setFolderForm({ open: true, editing: null })}>
              <FolderPlus size={12} className="size-3!" aria-hidden />
              新建文件夹
            </Button>
          )}
          {hasPermission('file:delete') && (
            <Button
              variant="danger-soft"
              size="sm"
              isDisabled={batchCount === 0}
              onPress={() => setBatchOpen(true)}
            >
              <Trash2 size={12} className="size-3!" aria-hidden />
              批量删除{batchCount > 0 ? `（${batchCount}）` : ''}
            </Button>
          )}
          <Button
            variant="tertiary"
            size="sm"
            aria-label={view === 'table' ? '切换为网格视图' : '切换为表格视图'}
            onPress={() => setView((v) => (v === 'table' ? 'grid' : 'table'))}
          >
            {view === 'table' ? (
              <LayoutGrid size={12} className="size-3!" aria-hidden />
            ) : (
              <List size={12} className="size-3!" aria-hidden />
            )}
            {view === 'table' ? '网格' : '列表'}
          </Button>
          <ColumnSettings ctrl={colCtrl} />
        </div>
      </div>

      {/* 表格区 / 网格区：两视图共用 query/selected/currentFolderId 状态 */}
      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
        {view === 'grid' ? (
          <>
            <FileGrid
              rows={rows}
              onOpenFolder={(f) => enterFolder(f.folder_id)}
              onPreview={setPreview}
              onAction={handleGridAction}
            />
            <div ref={sentinelRef} className="flex justify-center py-3">
              {isFetchingNextPage && <Spinner />}
            </div>
          </>
        ) : (
          <TableRoot className="flex! min-h-0 flex-col shadow-sm">
          <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
            <TableCornerOverlays />
            <TableContent
              aria-label="文件管理列表"
              className="min-w-[1080px]"
              selectionMode="multiple"
              selectionBehavior="toggle"
              selectedKeys={selected}
              onSelectionChange={setSelected}
            >
              <TableHeader className="sticky top-0 z-20 bg-surface-secondary">
                <TableColumn id="__select" className="pe-0!">
                  <SelectionCheckbox label="全选文件" />
                </TableColumn>
                {visibleColumns.map((col) => {
                  const sticky = stickyColProps(col.key, true)
                  const merged = `whitespace-nowrap ${'className' in sticky ? sticky.className : ''}`
                  return (
                    <TableColumn
                      key={col.key}
                      id={col.key}
                      isRowHeader={col.key === 'file_name'}
                      {...sticky}
                      className={merged}
                    >
                      {col.label}
                    </TableColumn>
                  )
                })}
              </TableHeader>
              <TableBody
                items={rows.map((row) => ({ ...row, id: rowId(row) }))}
                dependencies={[visibleColumns, rows]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <Folder size={20} aria-hidden className="text-muted" />
                      <Typography.Paragraph size="sm" color="muted">
                        暂无数据
                      </Typography.Paragraph>
                    </EmptyState>
                  )
                }
              >
                {(row) => (
                  <TableRow id={row.id}>
                    <TableCell key="__select" className="pe-0!">
                      {row.kind === 'file' ? (
                        <SelectionCheckbox
                          label={`选择 ${row.file_name}`}
                          variant="secondary"
                        />
                      ) : (
                        <span aria-hidden className="block size-4" />
                      )}
                    </TableCell>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key} {...stickyColProps(col.key, false)}>
                        {renderCell(row, col.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
            <div ref={sentinelRef} className="flex justify-center py-3">
              {isFetchingNextPage && <Spinner />}
            </div>
          </TableScrollContainer>
        </TableRoot>
        )}
      </div>

      {/* 弹窗挂载 */}
      <FolderFormDialog
        isOpen={folderForm.open}
        parentId={folderForm.parentId ?? currentFolderId}
        editing={folderForm.editing}
        onClose={() => setFolderForm({ open: false, editing: null })}
      />
      <FileRenameDialog
        isOpen={renaming !== null}
        target={renaming}
        onClose={() => setRenaming(null)}
      />
      <MoveDialog
        isOpen={moving !== null}
        target={moving?.row ?? null}
        kind={moving?.kind ?? 'file'}
        folders={folders ?? []}
        onClose={() => setMoving(null)}
      />
      <FileDeleteDialog
        isOpen={deleting !== null}
        kind={deleting?.kind ?? 'file'}
        names={deleting?.names ?? []}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      <BatchFileDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
      />
      <PreviewModal target={preview} onClose={() => setPreview(null)} />

      {/* 上传 Drawer（F3 空壳，F4 替换完整实现） */}
      <UploadDrawer
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folderId={currentFolderId}
        folders={folders ?? []}
        onUploaded={() => invalidateFileData()}
      />
      </div>
    </div>
  )
}
