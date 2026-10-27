import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
} from '@heroui/react'
import { Download, Eye, Folder, FolderOpen, Link2, Trash2 } from 'lucide-react'
import { getFileUrls } from '../../api/file'
import { hasPermission } from '../../stores/auth'
import type { FileFolder, SysFileRow } from '../../types/file'
import { CATEGORY_ICONS, VisibilityChip, formatSize } from './fileUtils'

export type FileGridRow = ({ kind: 'folder' } & FileFolder) | ({ kind: 'file' } & SysFileRow)

/** 网格行动作：预览单独走 onPreview；目录「打开」走 onOpenFolder */
export type FileGridAction = 'open' | 'download' | 'copy' | 'delete'

interface FileGridProps {
  rows: FileGridRow[]
  onOpenFolder: (f: FileFolder) => void
  onPreview: (f: SysFileRow) => void
  onAction: (action: FileGridAction, row: FileGridRow) => void
}

/**
 * 网格视图（F5）：目录卡在前，图片文件取缩略图。
 * 本组件仅在 index.tsx 的 view === 'grid' 分支挂载，因此缩略图查询天然只在网格视图启用。
 */
export default function FileGrid({ rows, onOpenFolder, onPreview, onAction }: FileGridProps) {
  // 目录在前、文件在后（防御性排序，与表格行顺序语义一致）
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1,
      ),
    [rows],
  )

  // 当前页图片文件 id，一次批量换取预签名 URL
  const imageIds = useMemo(
    () =>
      sorted
        .filter(
          (r): r is Extract<FileGridRow, { kind: 'file' }> =>
            r.kind === 'file' && r.category === 'image',
        )
        .map((r) => r.file_id),
    [sorted],
  )

  const { data: urlItems } = useQuery({
    queryKey: ['file-grid-urls', imageIds],
    queryFn: () => getFileUrls(imageIds),
    enabled: imageIds.length > 0,
  })

  const urlById = useMemo(
    () => new Map((urlItems ?? []).map((u) => [u.file_id, u.url])),
    [urlItems],
  )

  const canDownload = hasPermission('file:download')
  const delPerm = hasPermission('file:delete')

  const iconBtn = (
    label: string,
    icon: ReactNode,
    onPress: () => void,
    variant: 'tertiary' | 'danger-soft' = 'tertiary',
  ) => (
    <Tooltip>
      <TooltipTrigger>
        <Button
          size="sm"
          variant={variant}
          isIconOnly
          className="rounded-full!"
          onPress={onPress}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  if (sorted.length === 0) {
    return (
      <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
        <Folder size={20} aria-hidden className="text-muted" />
        <Typography.Paragraph size="sm" color="muted">
          暂无文件
        </Typography.Paragraph>
      </EmptyState>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      {sorted.map((row) => {
        const isFolder = row.kind === 'folder'
        const name = isFolder ? row.folder_name : row.file_name
        const url =
          !isFolder && row.category === 'image' ? urlById.get(row.file_id) : undefined
        const ThumbIcon = !isFolder ? CATEGORY_ICONS[row.category] : null
        return (
          <div
            key={isFolder ? `folder-${row.folder_id}` : `file-${row.file_id}`}
            className="group relative flex flex-col gap-1.5 rounded-xl border border-separator bg-surface p-2 hover:shadow-sm"
            onDoubleClick={isFolder ? () => onOpenFolder(row) : undefined}
          >
            {/* hover 操作：同表格行语义（目录=打开；文件=预览/下载/复制链接/删除） */}
            <div className="absolute end-1 top-1 z-10 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              {isFolder
                ? iconBtn('打开', <FolderOpen size={12} className="size-3!" aria-hidden />, () =>
                    onOpenFolder(row),
                  )
                : (
                    <>
                      {canDownload &&
                        iconBtn('预览', <Eye size={12} className="size-3!" aria-hidden />, () =>
                          onPreview(row),
                        )}
                      {canDownload &&
                        iconBtn('下载', <Download size={12} className="size-3!" aria-hidden />, () =>
                          onAction('download', row),
                        )}
                      {canDownload &&
                        iconBtn('复制链接', <Link2 size={12} className="size-3!" aria-hidden />, () =>
                          onAction('copy', row),
                        )}
                      {delPerm &&
                        iconBtn(
                          '删除',
                          <Trash2 size={12} className="size-3!" aria-hidden />,
                          () => onAction('delete', row),
                          'danger-soft',
                        )}
                    </>
                  )}
            </div>

            {/* 缩略图区：图片用真实 URL，其余用分类图标 */}
            {url ? (
              <img
                src={url}
                alt={name}
                loading="lazy"
                className="h-20 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-lg bg-surface-secondary">
                {ThumbIcon ? (
                  <ThumbIcon size={28} aria-hidden className="text-muted" />
                ) : (
                  <Folder size={28} aria-hidden className="text-warning" />
                )}
              </div>
            )}

            <Tooltip>
              <TooltipTrigger>
                <span
                  className="block cursor-default truncate text-xs"
                  title={isFolder ? undefined : name}
                >
                  {name}
                </span>
              </TooltipTrigger>
              <TooltipContent>{isFolder ? '双击进入' : name}</TooltipContent>
            </Tooltip>

            {!isFolder && (
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-muted">{formatSize(row.file_size)}</span>
                <VisibilityChip visibility={row.visibility} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
