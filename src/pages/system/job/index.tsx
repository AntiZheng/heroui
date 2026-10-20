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
  Switch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
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
import { Play, Plus, RotateCcw, Search, SquarePen, Timer, Trash2 } from 'lucide-react'
import {
  changeJobStatus,
  deleteJobs,
  getJobList,
  runJobOnce,
  type JobListQuery,
} from '../../../api/job'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import {
  CONCURRENT_OPTIONS,
  JOB_GROUP_OPTIONS,
  JOB_STATUS_OPTIONS,
  MISFIRE_OPTIONS,
  optionLabel,
  type SysJobRow,
} from '../../../types/job'
import JobFormModal from './JobFormModal'

const PAGE_SIZE = 10

const columns = [
  { key: 'job_id', label: '任务编号' },
  { key: 'job_name', label: '任务名称' },
  { key: 'job_group', label: '任务分组' },
  { key: 'invoke_target', label: '调用目标' },
  { key: 'cron_expression', label: 'cron 表达式' },
  { key: 'status', label: '状态' },
  { key: 'concurrent', label: '并发' },
  { key: 'misfire_policy', label: '错误策略' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
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

export default function JobPage() {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [query, setQuery] = useState<JobListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [nameInput, setNameInput] = useState('')
  const [groupInput, setGroupInput] = useState<string | null>(null)
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [jumpTo, setJumpTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysJobRow | null>(null)
  const [deleting, setDeleting] = useState<SysJobRow | null>(null)
  const [statusMap, setStatusMap] = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'job-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['job-list', query],
    queryFn: () => getJobList(query),
    placeholderData: keepPreviousData,
  })

  const rows = useMemo(() => data?.rows ?? [], [data])
  const pageSize = query.pageSize ?? PAGE_SIZE

  const batchCount = selected === 'all' ? rows.length : selected.size

  // 翻页/搜索/重置后清空勾选，避免残留跨页选择
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
      jobName: nameInput || undefined,
      jobGroup: groupInput ?? undefined,
      status: statusInput ?? undefined,
    }))

  const reset = () => {
    setNameInput('')
    setGroupInput(null)
    setStatusInput(null)
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const statusOf = (row: SysJobRow) => statusMap[row.job_id] ?? row.status

  const handleStatusToggle = async (row: SysJobRow, checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await changeJobStatus(row.job_id, next)
      setStatusMap((m) => ({ ...m, [row.job_id]: next }))
      toast('成功', { description: next === '0' ? '任务已启用' : '任务已暂停', variant: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  const handleRunOnce = async (row: SysJobRow) => {
    try {
      await runJobOnce(row.job_id)
    } catch {
      return
    }
    toast('成功', { description: `任务「${row.job_name}」已触发执行`, variant: 'success' })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteJobs([deleting.job_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    queryClient.invalidateQueries({ queryKey: ['job-list'] })
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.job_id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteJobs(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['job-list'] })
  }

  // 文本列单行截断，悬浮显示完整内容
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

  const renderCell = (row: SysJobRow, key: string) => {
    switch (key) {
      case 'job_group':
        return optionLabel(JOB_GROUP_OPTIONS, (row.job_group ?? '').toUpperCase())
      case 'status': {
        const active = statusOf(row) === '0'
        const label = active ? '正常' : '暂停'
        if (!hasPermission('system:job:edit')) {
          return (
            <Chip color={active ? 'success' : 'danger'} size="sm" variant="soft">
              {label}
            </Chip>
          )
        }
        return (
          <Switch
            size="sm"
            isSelected={active}
            onChange={(checked) => handleStatusToggle(row, checked)}
            className="group w-fit text-[11px] [--switch-control-bg:var(--danger-soft)] [--switch-control-bg-hover:var(--danger-soft-hover)] [--switch-control-bg-checked:var(--success-soft)] [--switch-control-bg-checked-hover:var(--success-soft-hover)]"
          >
            <SwitchContent className="w-fit">
              <SwitchControl className="h-6! w-16! rounded-full!">
                <SwitchThumb className="size-5! rounded-full! group-data-[selected=true]:ms-[calc(100%-1.375rem)]" />
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 flex items-center font-medium ${
                    active
                      ? 'left-2 text-success-soft-foreground'
                      : 'right-1.5 text-danger-soft-foreground'
                  }`}
                >
                  {label}
                </span>
              </SwitchControl>
              <span className="sr-only">任务状态 {label}</span>
            </SwitchContent>
          </Switch>
        )
      }
      case 'concurrent':
        return optionLabel(CONCURRENT_OPTIONS, row.concurrent)
      case 'misfire_policy':
        return optionLabel(MISFIRE_OPTIONS, row.misfire_policy)
      case 'create_time':
        return textCell(String(row.create_time ?? '—').replace('T', ' ').slice(0, 19))
      case 'invoke_target':
      case 'cron_expression':
        return textCell(row[key])
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            {hasPermission('system:job:edit') && (
              <>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      className="rounded-full!"
                      onPress={() => {
                        setEditing(row)
                        setFormOpen(true)
                      }}
                      aria-label="修改"
                    >
                      <SquarePen size={12} className="size-3!" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>修改</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      className="rounded-full!"
                      onPress={() => handleRunOnce(row)}
                      aria-label="执行一次"
                    >
                      <Play size={12} className="size-3!" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>执行一次</TooltipContent>
                </Tooltip>
              </>
            )}
            {hasPermission('system:job:remove') && (
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
        return textCell((row as unknown as Record<string, unknown>)[key])
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
          <SearchField
            aria-label="按任务名称搜索"
            value={nameInput}
            onChange={setNameInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">任务名称</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" className="text-xs!" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SelectRoot
            aria-label="任务分组"
            className="w-48"
            selectedKey={groupInput}
            onSelectionChange={(key) => {
              setGroupInput((key as string | null) ?? null)
            }}
          >
            <Label className="text-xs font-medium text-muted">任务分组</Label>
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
                {JOB_GROUP_OPTIONS.map((o) => (
                  <ListBoxItem key={o.key} id={o.key}>
                    {o.label}
                  </ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </SelectRoot>
          <SelectRoot
            aria-label="任务状态"
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
                  isPlaceholder ? <span className="text-muted">全部</span> : defaultChildren
                }
              </SelectValue>
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {JOB_STATUS_OPTIONS.map((o) => (
                  <ListBoxItem key={o.key} id={o.key}>
                    {o.label}
                  </ListBoxItem>
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
          <Typography.Heading level={6} className="text-[13px] leading-4">定时任务</Typography.Heading>
          <div className="flex items-center gap-2">
            {hasPermission('system:job:add') && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
                onPress={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={12} className="size-3!" aria-hidden />
                新增任务
              </Button>
            )}
            {hasPermission('system:job:remove') && (
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
              aria-label="定时任务列表"
              className="min-w-[1100px]"
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
                items={rows.map((r) => ({ ...r, id: r.job_id }))}
                dependencies={[visibleColumns, statusMap]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <Timer size={20} aria-hidden className="text-muted" />
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
                      <SelectionCheckbox label={`选择 ${row.job_name}`} variant="secondary" />
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

      <JobFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="任务"
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
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
                <AlertDialog.Heading>删除任务？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定删除任务「{deleting?.job_name}」吗？该操作不可撤销。</p>
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
