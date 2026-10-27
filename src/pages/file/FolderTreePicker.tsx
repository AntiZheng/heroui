// 上传目录弹层树：只读迷你目录树（无管理按钮/拖拽），点选节点即选中并收起浮层
// 视觉令牌与左侧 FolderTreePanel 同款（h-8 行、16px 缩进、导轨线、中性灰 hover/选中胶囊）
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Popover, ScrollShadow } from '@heroui/react'
import type { FileFolder } from '../../types/file'

const ROOT_ID = 0

interface Props {
  folders: FileFolder[]
  value: number
  onChange: (folderId: number) => void
}

export default function FolderTreePicker({ folders, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([ROOT_ID]))

  const byId = useMemo(() => new Map(folders.map((f) => [f.folder_id, f])), [folders])

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

  // 打开浮层或值变化时展开选中项的祖先链
  useEffect(() => {
    if (!open || !value) return
    const chain: number[] = []
    let cur = byId.get(value)
    while (cur) {
      chain.push(cur.folder_id)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      chain.forEach((id) => next.add(id))
      return next
    })
  }, [open, value, byId])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pick = (id: number) => {
    onChange(id)
    setOpen(false)
  }

  const renderNode = (folder: FileFolder, depth: number) => {
    const children = childrenMap.get(folder.folder_id) ?? []
    const isOpen = expanded.has(folder.folder_id)
    const isSelected = value === folder.folder_id
    return (
      <div key={folder.folder_id}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={isSelected}
          aria-expanded={children.length > 0 ? isOpen : undefined}
          onClick={() => pick(folder.folder_id)}
          className={`relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 text-xs transition-colors ${
            isSelected
              ? 'bg-foreground/5 font-medium text-foreground'
              : 'text-foreground hover:bg-foreground/5'
          }`}
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
        </div>
        {isOpen && children.length > 0 && (
          <div role="group">{children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  const rootChildren = childrenMap.get(ROOT_ID) ?? []
  const rootIsSelected = value === ROOT_ID
  const triggerLabel =
    value === ROOT_ID ? '全部文件（根目录）' : (byId.get(value)?.folder_path ?? `目录 #${value}`)

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="选择上传目录"
        className="flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-separator bg-surface px-2.5 text-xs transition-colors hover:bg-surface-secondary"
      >
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown size={12} aria-hidden className="shrink-0 text-muted" />
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="w-64 p-1.5">
        <ScrollShadow className="max-h-72">
          <div role="tree" aria-label="选择上传目录">
            <div
              role="treeitem"
              aria-level={1}
              aria-selected={rootIsSelected}
              aria-expanded={rootChildren.length > 0 ? expanded.has(ROOT_ID) : undefined}
              onClick={() => pick(ROOT_ID)}
              style={{ paddingLeft: 8 }}
              className={`relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 text-xs transition-colors ${
                rootIsSelected
                  ? 'bg-foreground/5 font-medium text-foreground'
                  : 'text-foreground hover:bg-foreground/5'
              }`}
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
              <span className="min-w-0 flex-1 truncate">全部文件（根目录）</span>
            </div>
            {expanded.has(ROOT_ID) && rootChildren.map((c) => renderNode(c, 1))}
          </div>
        </ScrollShadow>
      </Popover.Content>
    </Popover>
  )
}
