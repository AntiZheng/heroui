import { useEffect, useMemo, useRef, useState } from 'react'
import type { Selection } from 'react-aria-components'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
  toast,
} from '@heroui/react'
import { Eraser, LogIn, RotateCcw, Search, Trash2 } from 'lucide-react'
import {
  cleanLoginLogs,
  deleteLoginLogs,
  getLoginLogList,
  type LoginLogListQuery,
} from '../../../api/log'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import DateRangeFilter, { type DateRangeValue } from '../../../components/DateRangeFilter'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import { LOGIN_STATUS_OPTIONS, type SysLoginLogRow } from '../../../types/log'

const PAGE_SIZE = 10

const columns = [
  { key: 'info_id', label: '访问编号' },
  { key: 'user_name', label: '用户账号' },
  { key: 'ipaddr', label: '登录地址' },
  { key: 'login_location', label: '登录地点' },
  { key: 'browser', label: '浏览器' },
  { key: 'os', label: '操作系统' },
  { key: 'status', label: '登录状态' },
  { key: 'msg', label: '提示消息' },
  { key: 'login_time', label: '访问时间' },
]

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

function formatTime(value?: string | null) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

export default function LoginLogPage() {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [query, setQuery] = useState<LoginLogListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [ipaddrInput, setIpaddrInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null)
  const [jumpTo, setJumpTo] = useState('')
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'logininfor-table-cols', columns })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['logininfor-list', query],
    queryFn: () => getLoginLogList(query),
    placeholderData: keepPreviousData,
  })

  const rows = useMemo(() => data?.rows ?? [], [data])
  const pageSize = query.pageSize ?? PAGE_SIZE
  const batchCount = selected === 'all' ? rows.length : selected.size

  useEffect(() => {
    setSelected(new Set())
  }, [query])

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
    setQuery((q) => ({
      ...q,
      pageNum: 1,
      userName: userNameInput || undefined,
      ipaddr: ipaddrInput || undefined,
      status: status ?? undefined,
      beginTime: dateRange ? `${dateRange.start.toString()} 00:00:00` : undefined,
      endTime: dateRange ? `${dateRange.end.toString()} 23:59:59` : undefined,
    }))

  const reset = () => {
    setUserNameInput('')
    setIpaddrInput('')
    setStatus(null)
    setDateRange(null)
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.info_id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteLoginLogs(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['logininfor-list'] })
  }

  const handleClean = async () => {
    try {
      await cleanLoginLogs()
    } catch {
      return
    }
    toast('成功', { description: '清空登录日志成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['logininfor-list'] })
  }

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

  const renderCell = (row: SysLoginLogRow, key: string) => {
    switch (key) {
      case 'status':
        return (
          <Chip color={row.status === '1' ? 'danger' : 'success'} size="sm" variant="soft">
            {row.status === '1' ? '失败' : '成功'}
          </Chip>
        )
      case 'login_time':
        return textCell(formatTime(row.login_time))
      default:
        return textCell((row as unknown as Record<string, unknown>)[key])
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
        <SearchField
          aria-label="按用户账号搜索"
          value={userNameInput}
          onChange={setUserNameInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">用户账号</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SearchField
          aria-label="按登录地址搜索"
          value={ipaddrInput}
          onChange={setIpaddrInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">登录地址</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SelectRoot
          aria-label="登录状态"
          className="w-48"
          selectedKey={status}
          onSelectionChange={(key) => setStatus((key as string | null) ?? null)}
        >
          <Label className="text-xs font-medium text-muted">登录状态</Label>
          <SelectTrigger className="min-h-8!">
            <SelectValue className="text-xs!">
              {({ isPlaceholder, defaultChildren }) =>
                isPlaceholder ? <span className="text-muted">全部</span> : defaultChildren
              }
            </SelectValue>
            <SelectIndicator />
          </SelectTrigger>
          <SelectPopover>
            <ListBox>
              {LOGIN_STATUS_OPTIONS.map((option) => (
                <ListBoxItem key={option.key} id={option.key}>
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <DateRangeFilter label="登录时间" value={dateRange} onChange={setDateRange} />
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
          登录日志
        </Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('monitor:logininfor:remove') && (
            <>
              <Button
                variant="danger-soft"
                size="sm"
                isDisabled={batchCount === 0}
                onPress={() => setBatchOpen(true)}
              >
                <Trash2 size={12} className="size-3!" aria-hidden />
                批量删除{batchCount > 0 ? `（${batchCount}）` : ''}
              </Button>
              <Button variant="danger-soft" size="sm" onPress={() => setClearOpen(true)}>
                <Eraser size={12} className="size-3!" aria-hidden />
                清空
              </Button>
            </>
          )}
          <ColumnSettings ctrl={colCtrl} />
        </div>
      </div>

      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
        <TableRoot className="flex! min-h-0 flex-col shadow-sm">
          <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
            <TableCornerOverlays />
            <TableContent
              aria-label="登录日志列表"
              className="min-w-[1120px]"
              selectionMode="multiple"
              selectionBehavior="toggle"
              selectedKeys={selected}
              onSelectionChange={setSelected}
            >
              <TableHeader className="sticky top-0 z-20 bg-surface-secondary">
                <TableColumn id="__select" className="pe-0!">
                  <SelectionCheckbox label="全选" />
                </TableColumn>
                {visibleColumns.map((col) => {
                  const sticky = stickyColProps(col.key, true)
                  const merged = `whitespace-nowrap ${'className' in sticky ? sticky.className : ''}`
                  return (
                    <TableColumn
                      key={col.key}
                      id={col.key}
                      isRowHeader={col.key === visibleColumns[0].key}
                      {...sticky}
                      className={merged}
                    >
                      {col.label}
                    </TableColumn>
                  )
                })}
              </TableHeader>
              <TableBody
                items={rows.map((r) => ({ ...r, id: r.info_id }))}
                dependencies={[visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <LogIn size={20} aria-hidden className="text-muted" />
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
                      <SelectionCheckbox
                        label={`选择日志 ${row.info_id}`}
                        variant="secondary"
                      />
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

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="登录日志"
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
      />

      <AlertDialog isOpen={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialog.Backdrop variant={backdropVariant}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>清空登录日志？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定清空全部登录日志吗？该操作不可恢复。</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" size="sm" variant="tertiary">
                  取消
                </Button>
                <Button slot="close" size="sm" variant="danger" onPress={handleClean}>
                  清空
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
