import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationNextIcon,
  PaginationPrevious,
  PaginationPreviousIcon,
  PaginationRoot,
  PaginationSummary,
  Popover,
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
  TableFooter,
  TableHeader,
  TableRoot,
  TableRow,
  TableScrollContainer,
  Typography,
} from '@heroui/react'
import { GripVertical, Pin, RotateCcw, Search, Settings2, Users } from 'lucide-react'
import { getDeptTree, getUserList } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import { flattenDeptTree } from './deptTree'
import RowActions from './RowActions'
import UserFormModal from './UserFormModal'
import type { UserListQuery } from '../../../api/user'
import type { SysUserRow } from '../../../types/user'

const PAGE_SIZE = 10

function pageWindow(total: number, current: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

const columns = [
  { key: 'user_id', label: 'ID' },
  { key: 'user_name', label: '账号' },
  { key: 'nick_name', label: '昵称' },
  { key: 'phonenumber', label: '手机号' },
  { key: 'status', label: '状态' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

const COLS_STORAGE_KEY = 'user-table-cols'

interface ColPrefs {
  order: string[]
  visible: string[]
  pinned: string[]
}

const DEFAULT_PREFS: ColPrefs = {
  order: columns.map((c) => c.key),
  visible: columns.map((c) => c.key),
  pinned: [],
}

function loadPrefs(): ColPrefs {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      // 旧版格式为纯数组（可见列列表），迁移到新结构
      if (Array.isArray(parsed)) {
        const keys = parsed.filter((k) => columns.some((c) => c.key === k))
        return { ...DEFAULT_PREFS, visible: keys }
      }
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Partial<ColPrefs>
        const order = [...(p.order ?? DEFAULT_PREFS.order)].filter((k) =>
          columns.some((c) => c.key === k),
        )
        for (const c of columns) if (!order.includes(c.key)) order.push(c.key)
        const known = new Set(order)
        return {
          order,
          visible: (p.visible ?? []).filter((k) => known.has(k)),
          pinned: (p.pinned ?? []).filter((k) => known.has(k)),
        }
      }
    }
  } catch {
    // 存储损坏时回退默认
  }
  return DEFAULT_PREFS
}

export default function UserPage() {
  const [query, setQuery] = useState<UserListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [jumpTo, setJumpTo] = useState('')
  const [prefs, setPrefs] = useState<ColPrefs>(loadPrefs)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [colOffsets, setColOffsets] = useState<number[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysUserRow | null>(null)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const visibleSet = useMemo(() => new Set(prefs.visible), [prefs.visible])
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned])
  const toggleableColumns = columns.filter((c) => c.key !== 'actions')

  const persist = (next: ColPrefs) => {
    setPrefs(next)
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next))
  }

  const toggleCol = (key: string, selected: boolean) => {
    const next = new Set(visibleSet)
    if (selected) next.add(key)
    else next.delete(key)
    persist({ ...prefs, visible: [...next] })
  }

  const toggleAllCols = (selected: boolean) => {
    persist({ ...prefs, visible: selected ? toggleableColumns.map((c) => c.key) : [] })
  }

  const togglePin = (key: string) => {
    const next = new Set(pinnedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persist({ ...prefs, pinned: [...next] })
  }

  const moveCol = (drag: string, over: string) => {
    if (drag === over) return
    const order = prefs.order.filter((k) => k !== drag)
    order.splice(order.indexOf(over), 0, drag)
    persist({ ...prefs, order })
  }

  // 固定列排到最前，其余按用户排序；操作列始终在最后
  const orderedColumns = useMemo(() => {
    const rank = new Map(prefs.order.map((k, i) => [k, i] as const))
    return [...columns].sort((a, b) => {
      const pa = pinnedSet.has(a.key) ? 0 : 1
      const pb = pinnedSet.has(b.key) ? 0 : 1
      if (pa !== pb) return pa - pb
      return (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0)
    })
  }, [prefs.order, pinnedSet])

  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => c.key === 'actions' || visibleSet.has(c.key)),
    [orderedColumns, visibleSet],
  )

  // 弹层列表用显示顺序渲染，拖拽后与表格保持一致
  const popoverColumns = useMemo(
    () => orderedColumns.filter((c) => c.key !== 'actions'),
    [orderedColumns],
  )

  const lastPinnedIndex = useMemo(() => {
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      if (pinnedSet.has(visibleColumns[i].key)) return i
    }
    return -1
  }, [visibleColumns, pinnedSet])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (row: SysUserRow) => {
    setEditing(row)
    setFormOpen(true)
  }

  const { data: deptOptions } = useQuery({
    queryKey: ['dept-tree'],
    queryFn: getDeptTree,
    select: flattenDeptTree,
  })

  const { data, isPending } = useQuery({
    queryKey: ['user-list', query],
    queryFn: () => getUserList(query),
    placeholderData: keepPreviousData,
  })

  const pageSize = query.pageSize ?? PAGE_SIZE

  // HeroUI v3 的 Row 子级渲染函数(columnKey)不生效，需静态 Cell；items 需自带 id
  const rowsWithId = useMemo(
    () => (data?.rows ?? []).map((r) => ({ ...r, id: r.user_id })),
    [data],
  )

  // sticky 列的 left 偏移随列宽（内容/容器宽）变化，需从 DOM 实测
  const colSignature = visibleColumns.map((c) => c.key).join(',')
  useLayoutEffect(() => {
    const table = tableAreaRef.current?.querySelector('table')
    if (!table) return
    const measure = () => {
      const headRow = table.tHead?.rows.item(0)
      if (!headRow) return
      const tableLeft = table.getBoundingClientRect().left
      setColOffsets(Array.from(headRow.cells, (th) => th.getBoundingClientRect().left - tableLeft))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(table)
    return () => ro.disconnect()
  }, [colSignature, rowsWithId])

  // secondary 变体的单元格透明，sticky 固定列需补不透明背景
  const stickyColProps = (key: string, isHeader: boolean) => {
    const i = visibleColumns.findIndex((c) => c.key === key)
    if (i < 0 || !pinnedSet.has(key)) return {}
    return {
      className: `sticky z-10 ${isHeader ? 'bg-surface-secondary' : 'bg-field'} ${
        i === lastPinnedIndex ? 'shadow-[8px_0_12px_-6px_rgba(0,0,0,0.15)]' : ''
      }`,
      style: { left: colOffsets[i] ?? 0 },
    }
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    [data?.total, pageSize],
  )

  const jump = () => {
    const p = Math.min(Math.max(Number(jumpTo) || 1, 1), totalPages)
    setQuery((q) => ({ ...q, pageNum: p }))
    setJumpTo('')
  }

  const search = () =>
    setQuery((q) => ({ ...q, pageNum: 1, userName: userNameInput, phonenumber: phoneInput }))

  const reset = () => {
    setUserNameInput('')
    setPhoneInput('')
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const renderCell = (row: SysUserRow, key: string) => {
    switch (key) {
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'default'} size="sm">
            {row.status === '0' ? '正常' : '停用'}
          </Chip>
        )
      case 'actions':
        return <RowActions row={row} onEdit={openEdit} />
      case 'create_time':
        return <span>{String(row.create_time ?? '—').replace('T', ' ').slice(0, 19)}</span>
      default:
        return <span>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div ref={tableAreaRef}>
        <TableRoot variant="secondary">
          <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator px-4 pb-4 pt-4">
          <SearchField
            aria-label="按账号搜索"
            value={userNameInput}
            onChange={setUserNameInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">账号</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" className="text-sm!" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SearchField
            aria-label="按手机号搜索"
            value={phoneInput}
            onChange={setPhoneInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">手机号</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" className="text-sm!" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SelectRoot
            aria-label="部门"
            className="w-48"
            selectedKey={query.deptId ? String(query.deptId) : null}
            onSelectionChange={(key) => {
              const k = key as string | null
              setQuery((q) => ({ ...q, pageNum: 1, deptId: k ? Number(k) : undefined }))
            }}
          >
            <Label className="text-xs font-medium text-muted">部门</Label>
            <SelectTrigger>
              <SelectValue className="text-sm!">
                {({ isPlaceholder, defaultChildren }) =>
                  isPlaceholder ? <span className="text-muted">全部部门</span> : defaultChildren
                }
              </SelectValue>
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {(deptOptions ?? []).map((dept) => (
                  <ListBoxItem key={String(dept.id)} id={String(dept.id)}>{dept.label}</ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </SelectRoot>
          <Button variant="primary" onPress={search} className="ml-auto">
            <Search size={14} aria-hidden />
            搜索
          </Button>
          <Button variant="ghost" onPress={reset}>
            <RotateCcw size={14} aria-hidden />
            重置
          </Button>
          </div>

          <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Typography.Heading level={6}>用户列表</Typography.Heading>
        <div className="flex items-center gap-2">
          <Popover>
            <Button variant="ghost" aria-label="列设置">
              <Settings2 size={14} aria-hidden />
              列设置
            </Button>
            <Popover.Content className="w-52">
              <div aria-label="显示列" className="flex flex-col gap-1 p-2" role="group">
                <Checkbox
                  isSelected={
                    toggleableColumns.length > 0 && toggleableColumns.every((c) => visibleSet.has(c.key))
                  }
                  isIndeterminate={
                    !toggleableColumns.every((c) => visibleSet.has(c.key)) &&
                    toggleableColumns.some((c) => visibleSet.has(c.key))
                  }
                  onChange={toggleAllCols}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    全选
                  </Checkbox.Content>
                </Checkbox>
                {popoverColumns.map((col) => {
                  const pinned = pinnedSet.has(col.key)
                  return (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={() => setDragKey(col.key)}
                      onDragEnd={() => {
                        setDragKey(null)
                        setOverKey(null)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (col.key !== dragKey) setOverKey(col.key)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragKey) moveCol(dragKey, col.key)
                        setDragKey(null)
                        setOverKey(null)
                      }}
                      className={`flex items-center gap-0.5 rounded-md px-1 ${
                        dragKey && overKey === col.key && dragKey !== col.key ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <span
                        aria-hidden
                        className="cursor-grab text-muted active:cursor-grabbing"
                      >
                        <GripVertical size={14} />
                      </span>
                      <Checkbox
                        isSelected={visibleSet.has(col.key)}
                        onChange={(selected) => toggleCol(col.key, selected)}
                        className="flex-1"
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          {col.label}
                        </Checkbox.Content>
                      </Checkbox>
                      <button
                        type="button"
                        aria-pressed={pinned}
                        aria-label={pinned ? `取消固定${col.label}` : `固定${col.label}`}
                        onClick={() => togglePin(col.key)}
                        className={`flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-secondary ${
                          pinned ? 'text-accent' : 'text-muted'
                        }`}
                      >
                        <Pin size={13} aria-hidden className={pinned ? 'fill-current' : undefined} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </Popover.Content>
          </Popover>
          {hasPermission('system:user:add') && (
            <Button variant="primary" onPress={openCreate}>
              新增用户
            </Button>
          )}
        </div>
      </div>
          <div className="mx-4 overflow-hidden rounded-2xl border border-separator">
            <TableScrollContainer>
            <TableContent aria-label="用户列表" className="min-w-[720px]">
              <TableHeader>
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
                items={rowsWithId}
                // RAC 会缓存行渲染结果，列集变化时需靠 dependencies 强制重建行，否则单元格数与表头不一致抛错白屏
                dependencies={[visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <Users size={20} aria-hidden className="text-muted" />
                      <Typography.Paragraph size="sm" color="muted">暂无数据</Typography.Paragraph>
                    </EmptyState>
                  )
                }
              >
                {(row) => (
                  <TableRow id={row.id} className="bg-field">
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key} {...stickyColProps(col.key, false)}>
                        {renderCell(row, col.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
          </div>
        <TableFooter>
          <PaginationRoot size="sm">
            <PaginationSummary>
              {data?.total
                ? `第 ${(query.pageNum - 1) * pageSize + 1} 至 ${Math.min(query.pageNum * pageSize, data.total)} 条，共 ${data.total} 条`
                : '共 0 条'}
              <SelectRoot
                aria-label="每页条数"
                className="w-24"
                selectedKey={String(pageSize)}
                onSelectionChange={(key) => {
                  const k = key as string | null
                  if (k) setQuery((q) => ({ ...q, pageNum: 1, pageSize: Number(k) }))
                }}
              >
                <SelectTrigger className="h-7! min-h-0! items-center! rounded-3xl! border-transparent! bg-transparent! px-2! py-0! text-xs! font-medium! shadow-none! hover:border-transparent! hover:bg-default-hover!">
                  <SelectValue className="text-xs!">
                    {({ isPlaceholder, defaultChildren }) =>
                      isPlaceholder ? <span>{pageSize} 条/页</span> : defaultChildren
                    }
                  </SelectValue>
                  <SelectIndicator />
                </SelectTrigger>
                <SelectPopover>
                  <ListBox>
                    {[10, 20, 50].map((n) => (
                      <ListBoxItem key={String(n)} id={String(n)}>{n} 条/页</ListBoxItem>
                    ))}
                  </ListBox>
                </SelectPopover>
              </SelectRoot>
            </PaginationSummary>
            <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    isDisabled={query.pageNum <= 1}
                    onPress={() => setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }))}
                  >
                    <PaginationPreviousIcon aria-hidden />
                    上一页
                  </PaginationPrevious>
                </PaginationItem>
                {pageWindow(totalPages, query.pageNum).map((p, i) =>
                  p === '…' ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === query.pageNum}
                        onPress={() => setQuery((q) => ({ ...q, pageNum: p }))}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    isDisabled={query.pageNum >= totalPages}
                    onPress={() => setQuery((q) => ({ ...q, pageNum: q.pageNum + 1 }))}
                  >
                    下一页
                    <PaginationNextIcon aria-hidden />
                  </PaginationNext>
                </PaginationItem>
                <PaginationItem>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    跳至
                    <Input
                      aria-label="跳转页码"
                      inputMode="numeric"
                      value={jumpTo}
                      onChange={(e) => setJumpTo(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') jump()
                      }}
                      className="h-7! w-12! px-1! py-0! text-center! text-xs!"
                    />
                    页
                  </span>
                </PaginationItem>
              </PaginationContent>
          </PaginationRoot>
        </TableFooter>
        </TableRoot>
      </div>

      <UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}
