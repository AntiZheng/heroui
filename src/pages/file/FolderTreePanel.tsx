// 左侧目录树面板：虚拟根「全部文件」+ 自封装轻量树，支持点击导航、hover 管理、拖拽移动与外部文件拖入上传
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderPlus, SquarePen, Trash2 } from 'lucide-react'
import { ScrollShadow, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react'
import type { FileFolder } from '../../types/file'

export interface FolderDragPayload {
  kind: 'file' | 'folder'
  id: number
}

interface Props {
  folders: FileFolder[]
  currentFolderId: number
  editPerm: boolean
  delPerm: boolean
  onSelect: (folderId: number) => void
  onCreateChild: (parentId: number) => void
  onEdit: (folder: FileFolder) => void
  onDelete: (folder: FileFolder) => void
  /** 树内/列表拖拽移动（自/子孙目标已在组件内拦截，不会触发） */
  onDropMove: (targetId: number, payload: FolderDragPayload) => void
  /** 外部文件拖入目标目录上传 */
  onDropFiles: (targetId: number, files: File[]) => void
}

export const MOVE_TYPE = 'application/x-file-move'
const ROOT_ID = 0

function readMovePayload(e: React.DragEvent): FolderDragPayload | null {
  try {
    const raw = e.dataTransfer.getData(MOVE_TYPE)
    if (!raw) return null
    const p = JSON.parse(raw) as FolderDragPayload
    if ((p.kind === 'file' || p.kind === 'folder') && typeof p.id === 'number') return p
  } catch {
    /* 非本页发起的拖拽 */
  }
  return null
}

export default function FolderTreePanel({
  folders,
  currentFolderId,
  editPerm,
  delPerm,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
  onDropMove,
  onDropFiles,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([ROOT_ID]))
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const byId = useMemo(() => new Map(folders.map((f) => [f.folder_id, f])), [folders])

  // childrenMap：parent_id -> 子目录（按 sort、名称排序）
  const childrenMap = useMemo(() => {
    const map = new Map<number, FileFolder[]>()
    for (const f of folders) {
      const arr = map.get(f.parent_id) ?? []
      arr.push(f)
      map.set(f.parent_id, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort - b.sort || a.folder_name.localeCompare(b.folder_name, 'zh-Hans-CN'))
    }
    return map
  }, [folders])

  // 切换目录时自动展开祖先链
  useEffect(() => {
    if (!currentFolderId) return
    const chain: number[] = []
    let cur = byId.get(currentFolderId)
    while (cur) {
      chain.push(cur.folder_id)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      chain.forEach((id) => next.add(id))
      return next
    })
  }, [currentFolderId, byId])

  /** folder 拖到 target 是否非法（拖到自身或自己的子孙） */
  const isInvalidTarget = (folderId: number, targetId: number) => {
    let cur: number | undefined = targetId
    while (cur) {
      if (cur === folderId) return true
      cur = byId.get(cur)?.parent_id
    }
    return false
  }

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onDragOver = (e: React.DragEvent, id: number) => {
    const hasFiles = e.dataTransfer.types.includes('Files')
    const hasMove = e.dataTransfer.types.includes(MOVE_TYPE)
    if (!hasFiles && !hasMove) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move'
    setDragOverId(id)
  }

  const onDrop = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)
    if (e.dataTransfer.files.length > 0) {
      onDropFiles(id, Array.from(e.dataTransfer.files))
      return
    }
    const payload = readMovePayload(e)
    if (!payload) return
    if (payload.kind === 'folder' && isInvalidTarget(payload.id, id)) return
    onDropMove(id, payload)
  }

  const renderActions = (folder: FileFolder, canManage: boolean) => {
    if (!canManage) return null
    return (
      <span className="hidden shrink-0 items-center gap-0.5 group-hover/tree-item:flex">
        {editPerm && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-label={`在 ${folder.folder_name} 下新建子目录`}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateChild(folder.folder_id)
                }}
              >
                <FolderPlus size={12} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>新建子目录</TooltipContent>
          </Tooltip>
        )}
        {editPerm && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-label={`重命名 ${folder.folder_name}`}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(folder)
                }}
              >
                <SquarePen size={12} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>重命名</TooltipContent>
          </Tooltip>
        )}
        {delPerm && folder.is_system !== 1 && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-label={`删除 ${folder.folder_name}`}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-danger"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(folder)
                }}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        )}
      </span>
    )
  }

  const renderNode = (folder: FileFolder, depth: number) => {
    const children = childrenMap.get(folder.folder_id) ?? []
    const isOpen = expanded.has(folder.folder_id)
    const isCurrent = currentFolderId === folder.folder_id
    const canManage = folder.is_system !== 1
    const draggingFolder = dragOverId === folder.folder_id
    return (
      <div key={folder.folder_id}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={isCurrent}
          aria-expanded={children.length > 0 ? isOpen : undefined}
          draggable={canManage}
          onDragStart={(e) => {
            e.dataTransfer.setData(MOVE_TYPE, JSON.stringify({ kind: 'folder', id: folder.folder_id }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => onSelect(folder.folder_id)}
          onDragOver={(e) => onDragOver(e, folder.folder_id)}
          onDragLeave={() => setDragOverId((cur) => (cur === folder.folder_id ? null : cur))}
          onDrop={(e) => onDrop(e, folder.folder_id)}
          className={`group/tree-item relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 text-xs transition-colors ${
            isCurrent
              ? 'bg-foreground/5 font-medium text-foreground'
              : 'text-foreground hover:bg-foreground/5'
          } ${draggingFolder ? 'bg-accent-soft text-accent-soft-foreground ring-2 ring-accent ring-inset' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {depth > 0 && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0">
              {Array.from({ length: depth }).map((_, level) => (
                <span
                  key={level}
                  className="absolute inset-y-0 w-px bg-foreground/10"
                  style={{ left: 16 + level * 16 }}
                />
              ))}
            </span>
          )}
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={isOpen ? `折叠 ${folder.folder_name}` : `展开 ${folder.folder_name}`}
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                toggle(folder.folder_id)
              }}
            >
              <ChevronRight size={12} aria-hidden className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{folder.folder_name}</span>
          {renderActions(folder, canManage)}
        </div>
        {isOpen && children.length > 0 && (
          <div role="group">{children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  const rootChildren = childrenMap.get(ROOT_ID) ?? []
  const rootIsCurrent = currentFolderId === ROOT_ID
  const rootDragging = dragOverId === ROOT_ID

  return (
    <aside className="flex w-60 shrink-0 flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-medium text-muted">目录</span>
        {editPerm && (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-label="新建根目录"
                className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
                onClick={() => onCreateChild(ROOT_ID)}
              >
                <FolderPlus size={14} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>新建根目录</TooltipContent>
          </Tooltip>
        )}
      </div>
      <ScrollShadow className="min-h-0 flex-1 px-2 pb-2" hideScrollBar>
        <div role="tree" aria-label="文件目录树">
          <div
            role="treeitem"
            aria-level={1}
            aria-selected={rootIsCurrent}
            aria-expanded={rootChildren.length > 0 ? expanded.has(ROOT_ID) : undefined}
            onClick={() => onSelect(ROOT_ID)}
            onDragOver={(e) => onDragOver(e, ROOT_ID)}
            onDragLeave={() => setDragOverId((cur) => (cur === ROOT_ID ? null : cur))}
            onDrop={(e) => onDrop(e, ROOT_ID)}
            style={{ paddingLeft: 8 }}
            className={`group/tree-item relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 text-xs transition-colors ${
              rootIsCurrent
                ? 'bg-foreground/5 font-medium text-foreground'
                : 'text-foreground hover:bg-foreground/5'
            } ${rootDragging ? 'bg-accent-soft text-accent-soft-foreground ring-2 ring-accent ring-inset' : ''}`}
          >
            {rootChildren.length > 0 ? (
              <button
                type="button"
                aria-label={expanded.has(ROOT_ID) ? '折叠全部文件' : '展开全部文件'}
                className="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(ROOT_ID)
                }}
              >
                <ChevronRight
                  size={12}
                  aria-hidden
                  className={`transition-transform ${expanded.has(ROOT_ID) ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">全部文件</span>
          </div>
          {expanded.has(ROOT_ID) && rootChildren.map((c) => renderNode(c, 1))}
        </div>
      </ScrollShadow>
    </aside>
  )
}
