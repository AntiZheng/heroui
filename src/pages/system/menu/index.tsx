import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
  Button,
  Chip,
  EmptyState,
  Label,
  ListBox,
  ListBoxItem,
  SearchField,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
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
  ChevronDown,
  ChevronRight,
  FileText,
  FoldVertical,
  Folder,
  ListTree,
  MousePointerClick,
  Plus,
  RotateCcw,
  Search,
  SquareMenu,
  SquarePen,
  Trash2,
  TriangleAlert,
  UnfoldVertical,
} from 'lucide-react'
import { deleteMenu, getMenuList } from '../../../api/menu'
import { hasPermission } from '../../../stores/auth'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import { isMenuComponentRegistered } from '../../../components/layout/menuNav'
import type { MenuListQuery, SysMenuRow } from '../../../types/menu'
import { countAll, countIds, flattenVisible } from './menuTree'
import MenuFormModal from './MenuFormModal'

const columns = [
  { key: 'menu_name', label: '菜单名称' },
  { key: 'menu_type', label: '类型' },
  { key: 'order_num', label: '排序' },
  { key: 'perms', label: '权限标识' },
  { key: 'component', label: '组件路径' },
  { key: 'status', label: '状态' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

const typeIcons = { M: Folder, C: SquareMenu, F: MousePointerClick } as const

export default function MenuPage() {
  const backdropVariant = useModalBackdropVariant()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState<MenuListQuery>({})
  const [nameInput, setNameInput] = useState('')
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysMenuRow | null>(null)
  const [presetParentId, setPresetParentId] = useState<number | undefined>(undefined)
  const [deleting, setDeleting] = useState<SysMenuRow | null>(null)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'menu-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['menu-list', query],
    queryFn: () => getMenuList(query),
  })

  const tree = useMemo(() => data ?? [], [data])

  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      setExpanded(new Set(tree.map((r) => r.menu_id)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree])

  const visibleRows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded])
  const totalCount = useMemo(() => countAll(tree), [tree])
  const allExpanded = visibleRows.length === totalCount && totalCount > 0

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set())
    else setExpanded(new Set(countIds(tree)))
  }

  const search = () =>
    setQuery({ menuName: nameInput || undefined, status: statusInput ?? undefined })

  const reset = () => {
    setNameInput('')
    setStatusInput(null)
    setQuery({})
  }

  const openCreate = (parentId?: number) => {
    setEditing(null)
    setPresetParentId(parentId)
    setFormOpen(true)
  }

  const openEdit = (row: SysMenuRow) => {
    setEditing(row)
    setPresetParentId(undefined)
    setFormOpen(true)
  }

  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['menu-list'] })
    queryClient.invalidateQueries({ queryKey: ['menu-tree'] })
    queryClient.invalidateQueries({ queryKey: ['user-routers'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMenu(deleting.menu_id)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    refreshAfterChange()
  }

  const renderCell = (row: SysMenuRow, depth: number, key: string) => {
    switch (key) {
      case 'menu_name': {
        const TypeIcon = typeIcons[row.menu_type] ?? FileText
        return (
          <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
            {row.children?.length ? (
              <button
                type="button"
                aria-label={expanded.has(row.menu_id) ? '折叠子菜单' : '展开子菜单'}
                aria-expanded={expanded.has(row.menu_id)}
                onClick={() => toggleExpand(row.menu_id)}
                className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                {expanded.has(row.menu_id) ? (
                  <ChevronDown size={14} aria-hidden />
                ) : (
                  <ChevronRight size={14} aria-hidden />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            <TypeIcon size={13} aria-hidden className="shrink-0 text-muted" />
            <span className="font-medium">{row.menu_name}</span>
          </span>
        )
      }
      case 'menu_type':
        return (
          <Chip
            color={
              row.menu_type === 'M' ? 'accent' : row.menu_type === 'F' ? 'warning' : 'success'
            }
            size="sm"
            variant="soft"
          >
            {row.menu_type === 'M' ? '目录' : row.menu_type === 'F' ? '按钮' : '菜单'}
          </Chip>
        )
      case 'order_num':
        return <span>{row.order_num}</span>
      case 'perms':
        return <span className="text-muted">{row.perms || '—'}</span>
      case 'component': {
        const unregistered =
          row.menu_type === 'C' &&
          row.is_frame !== 0 &&
          !isMenuComponentRegistered(row.component)
        return (
          <span className="flex items-center gap-1.5">
            <span className="max-w-[200px] truncate text-muted">{row.component || '—'}</span>
            {unregistered && (
              <Tooltip>
                <TooltipTrigger>
                  <span
                    tabIndex={0}
                    aria-label="组件未注册"
                    className="inline-flex cursor-default text-warning"
                  >
                    <TriangleAlert size={12} aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>组件未注册，侧栏与路由不会生成</TooltipContent>
              </Tooltip>
            )}
          </span>
        )
      }
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'danger'} size="sm" variant="soft">
            {row.status === '0' ? '正常' : '停用'}
          </Chip>
        )
      case 'create_time':
        return <span>{String(row.create_time ?? '—').replace('T', ' ').slice(0, 19)}</span>
      case 'actions': {
        const hasChildren = (row.children?.length ?? 0) > 0
        return (
          <div className="flex items-center gap-1">
            {row.menu_type !== 'F' && hasPermission('system:menu:add') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => openCreate(row.menu_id)}
                    aria-label="新增子菜单"
                  >
                    <Plus size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新增子菜单</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('system:menu:edit') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => openEdit(row)}
                    aria-label="修改"
                  >
                    <SquarePen size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>修改</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('system:menu:remove') && (
              <Tooltip>
                <TooltipTrigger>
                  {hasChildren ? (
                    <span tabIndex={0} className="inline-flex">
                      <Button
                        size="sm"
                        variant="danger-soft"
                        isIconOnly
                        className="rounded-full!"
                        isDisabled
                        aria-label="存在子菜单，不可删除"
                      >
                        <Trash2 size={12} className="size-3!" aria-hidden />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger-soft"
                      isIconOnly
                      className="rounded-full!"
                      onPress={() => setDeleting(row)}
                      aria-label="删除"
                    >
                      <Trash2 size={12} className="size-3!" aria-hidden />
                    </Button>
                  )}
                </TooltipTrigger>
                <TooltipContent>{hasChildren ? '请先删除子菜单' : '删除'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      }
      default:
        return <span>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</span>
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
        <SearchField
          aria-label="按菜单名称搜索"
          value={nameInput}
          onChange={setNameInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">菜单名称</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SelectRoot
          aria-label="状态"
          className="w-48"
          selectedKey={statusInput}
          onSelectionChange={(key) => {
            setStatusInput((key as string | null) ?? null)
          }}
        >
          <Label className="text-xs font-medium text-muted">状态</Label>
          <SelectTrigger className="min-h-8!">
            <SelectValue className="text-xs!">
              {({ isPlaceholder, defaultChildren }) =>
                isPlaceholder ? <span className="text-muted">全部状态</span> : defaultChildren
              }
            </SelectValue>
            <SelectIndicator />
          </SelectTrigger>
          <SelectPopover>
            <ListBox>
              <ListBoxItem id="0">正常</ListBoxItem>
              <ListBoxItem id="1">停用</ListBoxItem>
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <Button
          variant="secondary"
          size="sm"
          onPress={search}
          className="ml-auto bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
        >
          <Search size={12} className="size-3!" aria-hidden />
          搜索
        </Button>
        <Button variant="tertiary" size="sm" onPress={reset}>
          <RotateCcw size={12} className="size-3!" aria-hidden />
          重置
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <Typography.Heading level={6} className="text-[13px] leading-4">
          菜单列表
        </Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('system:menu:add') && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={() => openCreate()}
            >
              <Plus size={12} className="size-3!" aria-hidden />
              新增菜单
            </Button>
          )}
          <Button variant="tertiary" size="sm" onPress={toggleAll}>
            {allExpanded ? (
              <FoldVertical size={12} className="size-3!" aria-hidden />
            ) : (
              <UnfoldVertical size={12} className="size-3!" aria-hidden />
            )}
            {allExpanded ? '折叠' : '展开'}
          </Button>
          <ColumnSettings ctrl={colCtrl} />
        </div>
      </div>
      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
        <TableRoot className="flex! min-h-0 flex-col shadow-sm">
          <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
            <TableCornerOverlays />
            <TableContent aria-label="菜单列表" className="min-w-[880px]">
              <TableHeader className="sticky top-0 z-20 bg-surface-secondary">
                {visibleColumns.map((col) => (
                  <TableColumn
                    key={col.key}
                    id={col.key}
                    isRowHeader={col.key === visibleColumns[0].key}
                    {...stickyColProps(col.key, true)}
                  >
                    {col.label}
                  </TableColumn>
                ))}
              </TableHeader>
              <TableBody
                items={visibleRows.map((r) => r.row)}
                dependencies={[visibleRows, visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <ListTree size={20} aria-hidden className="text-muted" />
                      <Typography.Paragraph size="sm" color="muted">
                        暂无数据
                      </Typography.Paragraph>
                    </EmptyState>
                  )
                }
              >
                {(row) => {
                  const flat = visibleRows.find((r) => r.row.menu_id === row.menu_id)
                  return (
                    <TableRow id={row.menu_id}>
                      {visibleColumns.map((col) => (
                        <TableCell key={col.key} {...stickyColProps(col.key, false)}>
                          {renderCell(row, flat?.depth ?? 0, col.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                }}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </TableRoot>
      </div>

      <MenuFormModal
        isOpen={formOpen}
        editing={editing}
        presetParentId={presetParentId}
        tree={tree}
        onClose={() => setFormOpen(false)}
      />

      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
      >
        <AlertDialog.Backdrop variant={backdropVariant}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>删除菜单？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定删除菜单「{deleting?.menu_name}」吗？该操作不可撤销。</p>
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
    </div>
  )
}
