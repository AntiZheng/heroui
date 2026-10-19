import { useEffect, useMemo, useRef, useState } from 'react'
import type { Selection } from 'react-aria-components'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
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
  Typography,
  toast,
} from '@heroui/react'
import { RotateCcw, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { deleteUsers, getDeptTree, getUserList } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import { flattenDeptTree } from './deptTree'
import RowActions from './RowActions'
import StatusSwitch from './StatusSwitch'
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
  { key: 'status_switch', label: '启用' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

export default function UserPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState<UserListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [jumpTo, setJumpTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysUserRow | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'user-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

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

  const batchCount = selected === 'all' ? rowsWithId.length : selected.size

  // 翻页/搜索/重置后清空勾选，避免残留跨页选择
  useEffect(() => {
    setSelected(new Set())
  }, [query])

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rowsWithId.map((r) => r.id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteUsers(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['user-list'] })
    queryClient.invalidateQueries({ queryKey: ['user-total'] })
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
          <Chip color={row.status === '0' ? 'success' : 'danger'} size="sm" variant="soft">
            {row.status === '0' ? '正常' : '停用'}
          </Chip>
        )
      case 'status_switch':
        return <StatusSwitch row={row} />
      case 'actions':
        return <RowActions row={row} onEdit={openEdit} />
      case 'create_time':
        return <span>{String(row.create_time ?? '—').replace('T', ' ').slice(0, 19)}</span>
      default:
        return <span>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</span>
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
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
              <SearchField.Input placeholder="回车搜索" className="text-xs!" />
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
              <SearchField.Input placeholder="回车搜索" className="text-xs!" />
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
            <SelectTrigger className="min-h-8!">
              <SelectValue className="text-xs!">
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
        <Typography.Heading level={6} className="text-[13px] leading-4">用户列表</Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('system:user:add') && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={openCreate}
            >
              <UserPlus size={12} className="size-3!" aria-hidden />
              新增用户
            </Button>
          )}
          {hasPermission('system:user:remove') && (
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
          <ColumnSettings ctrl={colCtrl} />
        </div>
      </div>
      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
        <TableRoot className="flex! min-h-0 flex-col shadow-sm">
          <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
          <TableCornerOverlays />
            <TableContent
              aria-label="用户列表"
              className="min-w-[720px]"
              selectionMode="multiple"
              selectionBehavior="toggle"
              selectedKeys={selected}
              onSelectionChange={setSelected}
            >
              <TableHeader className="sticky top-0 z-20 bg-surface-secondary">
                <TableColumn id="__select" className="pe-0!">
                  <SelectionCheckbox label="全选" />
                </TableColumn>
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
                  <TableRow id={row.id}>
                    <TableCell key="__select" className="pe-0!">
                      <SelectionCheckbox label={`选择 ${row.user_name}`} />
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
          </TableScrollContainer>
        </TableRoot>
      </div>
      <div className="flex items-center">
          <PaginationRoot size="sm">
            <PaginationSummary>
              {data?.total
                ? `第 ${(query.pageNum - 1) * pageSize + 1} 至 ${Math.min(query.pageNum * pageSize, data.total)} 条，共 ${data.total} 条`
                : '共 0 条'}
              <PageSizeStepper
                pageSize={pageSize}
                onChange={(n) => setQuery((q) => ({ ...q, pageNum: 1, pageSize: n }))}
              />
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
      </div>

      <UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="用户"
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
      />
    </div>
  )
}
