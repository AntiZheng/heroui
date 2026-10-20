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
import { Eraser, Eye, RotateCcw, ScrollText, Search, Trash2 } from 'lucide-react'
import {
  cleanOperLogs,
  deleteOperLogs,
  getOperLogList,
  type OperLogListQuery,
} from '../../../api/log'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import DateRangeFilter, { type DateRangeValue } from '../../../components/DateRangeFilter'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import {
  OPER_BUSINESS_TYPE_LABELS,
  OPER_BUSINESS_TYPE_OPTIONS,
  OPER_STATUS_OPTIONS,
  type SysOperLogRow,
} from '../../../types/log'
import OperLogDetailModal from './OperLogDetailModal'

const PAGE_SIZE = 10

const columns = [
  { key: 'oper_id', label: '日志编号' },
  { key: 'title', label: '系统模块' },
  { key: 'business_type', label: '操作类型' },
  { key: 'request_method', label: '请求方式' },
  { key: 'oper_name', label: '操作人员' },
  { key: 'oper_ip', label: '操作地址' },
  { key: 'status', label: '操作状态' },
  { key: 'oper_time', label: '操作时间' },
  { key: 'actions', label: '操作' },
]

const BUSINESS_COLOR: Record<number, 'default' | 'success' | 'accent' | 'danger'> = {
  0: 'default',
  1: 'success',
  2: 'accent',
  3: 'danger',
}

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

export default function OperLogPage() {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [query, setQuery] = useState<OperLogListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [titleInput, setTitleInput] = useState('')
  const [operNameInput, setOperNameInput] = useState('')
  const [businessType, setBusinessType] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null)
  const [jumpTo, setJumpTo] = useState('')
  const [detail, setDetail] = useState<SysOperLogRow | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'operlog-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['operlog-list', query],
    queryFn: () => getOperLogList(query),
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
      title: titleInput || undefined,
      operName: operNameInput || undefined,
      businessType: businessType === null ? undefined : Number(businessType),
      status: status === null ? undefined : Number(status),
      beginTime: dateRange ? `${dateRange.start.toString()} 00:00:00` : undefined,
      endTime: dateRange ? `${dateRange.end.toString()} 23:59:59` : undefined,
    }))

  const reset = () => {
    setTitleInput('')
    setOperNameInput('')
    setBusinessType(null)
    setStatus(null)
    setDateRange(null)
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.oper_id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteOperLogs(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['operlog-list'] })
  }

  const handleClean = async () => {
    try {
      await cleanOperLogs()
    } catch {
      return
    }
    toast('成功', { description: '清空操作日志成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['operlog-list'] })
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

  const renderCell = (row: SysOperLogRow, key: string) => {
    switch (key) {
      case 'business_type': {
        const type = row.business_type ?? 0
        return (
          <Chip color={BUSINESS_COLOR[type] ?? 'default'} size="sm" variant="soft">
            {OPER_BUSINESS_TYPE_LABELS[type] ?? '其他'}
          </Chip>
        )
      }
      case 'status':
        return (
          <Chip color={row.status === 1 ? 'danger' : 'success'} size="sm" variant="soft">
            {row.status === 1 ? '异常' : '正常'}
          </Chip>
        )
      case 'oper_time':
        return textCell(formatTime(row.oper_time))
      case 'actions':
        return (
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="sm"
                variant="tertiary"
                isIconOnly
                className="rounded-full!"
                onPress={() => setDetail(row)}
                aria-label="详情"
              >
                <Eye size={12} className="size-3!" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>详情</TooltipContent>
          </Tooltip>
        )
      default:
        return textCell((row as unknown as Record<string, unknown>)[key])
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
        <SearchField
          aria-label="按模块标题搜索"
          value={titleInput}
          onChange={setTitleInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">模块标题</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SearchField
          aria-label="按操作人员搜索"
          value={operNameInput}
          onChange={setOperNameInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">操作人员</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SelectRoot
          aria-label="操作类型"
          className="w-48"
          selectedKey={businessType}
          onSelectionChange={(key) => setBusinessType((key as string | null) ?? null)}
        >
          <Label className="text-xs font-medium text-muted">操作类型</Label>
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
              {OPER_BUSINESS_TYPE_OPTIONS.map((option) => (
                <ListBoxItem key={option.key} id={option.key}>
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <SelectRoot
          aria-label="操作状态"
          className="w-48"
          selectedKey={status}
          onSelectionChange={(key) => setStatus((key as string | null) ?? null)}
        >
          <Label className="text-xs font-medium text-muted">操作状态</Label>
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
              {OPER_STATUS_OPTIONS.map((option) => (
                <ListBoxItem key={option.key} id={option.key}>
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <DateRangeFilter label="操作时间" value={dateRange} onChange={setDateRange} />
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
          操作日志
        </Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('monitor:operlog:remove') && (
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
              aria-label="操作日志列表"
              className="min-w-[1040px]"
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
                items={rows.map((r) => ({ ...r, id: r.oper_id }))}
                dependencies={[visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <ScrollText size={20} aria-hidden className="text-muted" />
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
                        label={`选择日志 ${row.oper_id}`}
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

      <OperLogDetailModal log={detail} onClose={() => setDetail(null)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="操作日志"
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
                <AlertDialog.Heading>清空操作日志？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定清空全部操作日志吗？该操作不可恢复。</p>
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
