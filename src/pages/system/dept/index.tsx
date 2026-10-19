import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Building2,
  ChevronDown,
  ChevronRight,
  FoldVertical,
  Plus,
  RotateCcw,
  Search,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react'
import { deleteDepts, getDeptList, type DeptListQuery } from '../../../api/dept'
import { hasPermission } from '../../../stores/auth'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import type { SysDeptRow } from '../../../types/dept'
import { flattenVisible } from './deptTree'
import DeptFormModal from './DeptFormModal'

const columns = [
  { key: 'dept_name', label: '部门名称' },
  { key: 'order_num', label: '排序' },
  { key: 'status', label: '状态' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

function countAll(rows: SysDeptRow[]): number {
  return rows.reduce((acc, r) => acc + 1 + countAll(r.children ?? []), 0)
}

export default function DeptPage() {
  const [query, setQuery] = useState<DeptListQuery>({})
  const [nameInput, setNameInput] = useState('')
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysDeptRow | null>(null)
  const [presetParentId, setPresetParentId] = useState<number | undefined>(undefined)
  const [deleting, setDeleting] = useState<SysDeptRow | null>(null)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'dept-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['dept-list', query],
    queryFn: () => getDeptList(query),
  })

  const tree = useMemo(() => data ?? [], [data])

  // 首次加载展开顶级
  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      setExpanded(new Set(tree.map((r) => r.dept_id)))
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

  const search = () => setQuery({ deptName: nameInput || undefined, status: statusInput ?? undefined })

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
  const openEdit = (row: SysDeptRow) => {
    setEditing(row)
    setPresetParentId(undefined)
    setFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteDepts([deleting.dept_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
  }

  const renderCell = (row: SysDeptRow, depth: number, key: string) => {
    switch (key) {
      case 'dept_name':
        return (
          <span
            className="flex items-center gap-1.5"
            style={{ paddingLeft: depth * 20 }}
          >
            {row.children?.length ? (
              <button
                type="button"
                aria-label={expanded.has(row.dept_id) ? '折叠子部门' : '展开子部门'}
                aria-expanded={expanded.has(row.dept_id)}
                onClick={() => toggleExpand(row.dept_id)}
                className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                {expanded.has(row.dept_id) ? (
                  <ChevronDown size={14} aria-hidden />
                ) : (
                  <ChevronRight size={14} aria-hidden />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            <span className="font-medium">{row.dept_name}</span>
          </span>
        )
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'danger'} size="sm" variant="soft">
            {row.status === '0' ? '正常' : '停用'}
          </Chip>
        )
      case 'create_time':
        return <span>{String(row.create_time ?? '—').replace('T', ' ').slice(0, 19)}</span>
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            {hasPermission('system:dept:add') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => openCreate(row.dept_id)}
                    aria-label="新增子部门"
                  >
                    <Plus size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新增子部门</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('system:dept:edit') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button size="sm" variant="tertiary" isIconOnly className="rounded-full!" onPress={() => openEdit(row)} aria-label="修改">
                    <SquarePen size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>修改</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('system:dept:remove') && (
              <Tooltip>
                <TooltipTrigger>
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
                </TooltipTrigger>
                <TooltipContent>删除</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      default:
        return <span>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</span>
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
          <SearchField
            aria-label="按部门名称搜索"
            value={nameInput}
            onChange={setNameInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">部门名称</Label>
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
          <Button variant="primary" size="sm" onPress={search} className="ml-auto">
            <Search size={12} className="size-3!" aria-hidden />
            搜索
          </Button>
          <Button variant="ghost" size="sm" onPress={reset}>
            <RotateCcw size={12} className="size-3!" aria-hidden />
            重置
          </Button>
      </div>
      <div className="flex items-center justify-between">
          <Typography.Heading level={6} className="text-[13px] leading-4">部门列表</Typography.Heading>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onPress={toggleAll}>
              {allExpanded ? (
                <FoldVertical size={12} className="size-3!" aria-hidden />
              ) : (
                <UnfoldVertical size={12} className="size-3!" aria-hidden />
              )}
              {allExpanded ? '折叠' : '展开'}
            </Button>
            {hasPermission('system:dept:add') && (
              <Button variant="primary" size="sm" onPress={() => openCreate()}>
                <Plus size={12} className="size-3!" aria-hidden />
                新增部门
              </Button>
            )}
            <ColumnSettings ctrl={colCtrl} />
          </div>
      </div>
      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
      <TableRoot className="flex! min-h-0 flex-col shadow-sm">
        <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
          <TableCornerOverlays />
            <TableContent aria-label="部门列表" className="min-w-[720px]">
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
                      <Building2 size={20} aria-hidden className="text-muted" />
                      <Typography.Paragraph size="sm" color="muted">
                        暂无数据
                      </Typography.Paragraph>
                    </EmptyState>
                  )
                }
              >
                {(row) => {
                  const flat = visibleRows.find((r) => r.row.dept_id === row.dept_id)
                  return (
                    <TableRow id={row.dept_id}>
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

      <DeptFormModal
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
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>删除部门？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定删除部门「{deleting?.dept_name}」吗？该操作不可撤销。</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  取消
                </Button>
                <Button slot="close" variant="danger" onPress={handleDelete}>
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

function countIds(rows: SysDeptRow[]): number[] {
  return rows.flatMap((r) => [r.dept_id, ...(r.children?.length ? countIds(r.children) : [])])
}
