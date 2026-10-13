import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardContent,
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
import { RotateCcw, Search, Settings2, Users } from 'lucide-react'
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
const DEFAULT_VISIBLE_COLS = columns.map((c) => c.key)

function loadVisibleCols(): Set<string> {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // 存储损坏时回退默认全显
  }
  return new Set(DEFAULT_VISIBLE_COLS)
}

export default function UserPage() {
  const [query, setQuery] = useState<UserListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [jumpTo, setJumpTo] = useState('')
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysUserRow | null>(null)

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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    [data?.total, pageSize],
  )

  const jump = () => {
    const p = Math.min(Math.max(Number(jumpTo) || 1, 1), totalPages)
    setQuery((q) => ({ ...q, pageNum: p }))
    setJumpTo('')
  }

  const toggleCol = (key: string, selected: boolean) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (selected) next.add(key)
      else next.delete(key)
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const visibleColumns = columns.filter((c) => visibleCols.has(c.key))

  const search = () =>
    setQuery((q) => ({ ...q, pageNum: 1, userName: userNameInput, phonenumber: phoneInput }))

  const reset = () => {
    setUserNameInput('')
    setPhoneInput('')
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  // HeroUI v3 的 Row 子级渲染函数(columnKey)不生效，需静态 Cell；items 需自带 id
  const rowsWithId = useMemo(
    () => (data?.rows ?? []).map((r) => ({ ...r, id: r.user_id })),
    [data],
  )

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
      default:
        return <span>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</span>
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-row flex-wrap items-end gap-3">
          <SearchField
            aria-label="按账号搜索"
            variant="secondary"
            value={userNameInput}
            onChange={setUserNameInput}
            onSubmit={search}
            className="w-48"
          >
            <Label>账号</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SearchField
            aria-label="按手机号搜索"
            variant="secondary"
            value={phoneInput}
            onChange={setPhoneInput}
            onSubmit={search}
            className="w-48"
          >
            <Label>手机号</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" />
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
            <Label>部门</Label>
            <SelectTrigger>
              <SelectValue>
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
          <Button variant="primary" onPress={search}>
            <Search size={14} aria-hidden />
            搜索
          </Button>
          <Button variant="secondary" onPress={reset}>
            <RotateCcw size={14} aria-hidden />
            重置
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Typography.Heading level={6}>用户列表</Typography.Heading>
        <div className="flex items-center gap-2">
          <Popover>
            <Button variant="secondary" aria-label="列设置">
              <Settings2 size={14} aria-hidden />
              列设置
            </Button>
            <Popover.Content className="w-36">
              <div aria-label="显示列" className="flex flex-col gap-1 p-2" role="group">
                {columns
                  .filter((c) => c.key !== 'actions')
                  .map((col) => (
                    <Checkbox
                      key={col.key}
                      isSelected={visibleCols.has(col.key)}
                      onChange={(selected) => toggleCol(col.key, selected)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {col.label}
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
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
      <TableRoot>
        <TableScrollContainer>
          <TableContent aria-label="用户列表" className="min-w-[720px]">
            <TableHeader>
              {visibleColumns.map((col) => (
                <TableColumn key={col.key} id={col.key} isRowHeader={col.key === 'user_name'}>
                  {col.label}
                </TableColumn>
              ))}
            </TableHeader>
            <TableBody
              items={rowsWithId}
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
                <TableRow id={row.id}>
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key}>{renderCell(row, col.key)}</TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
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

      <UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}
