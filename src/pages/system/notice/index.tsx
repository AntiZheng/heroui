import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Megaphone, Plus, RotateCcw, Search, SquarePen, Trash2 } from 'lucide-react'
import { deleteNotices, getNoticeList, type NoticeListQuery } from '../../../api/notice'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import {
  NOTICE_STATUS_OPTIONS,
  NOTICE_TYPE_OPTIONS,
  optionLabel,
  type SysNoticeRow,
} from '../../../types/notice'
import NoticeDetailDrawer from './NoticeDetailDrawer'

const PAGE_SIZE = 10

const columns = [
  { key: 'notice_title', label: '公告标题' },
  { key: 'notice_type', label: '公告类型' },
  { key: 'status', label: '状态' },
  { key: 'create_by', label: '创建者' },
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

export default function NoticePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [query, setQuery] = useState<NoticeListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [titleInput, setTitleInput] = useState('')
  const [typeInput, setTypeInput] = useState<string | null>(null)
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [creatorInput, setCreatorInput] = useState('')
  const [jumpTo, setJumpTo] = useState('')
  const [viewing, setViewing] = useState<SysNoticeRow | null>(null)
  const [deleting, setDeleting] = useState<SysNoticeRow | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'notice-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['notice-list', query],
    queryFn: () => getNoticeList(query),
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
      noticeTitle: titleInput.trim() || undefined,
      noticeType: typeInput ?? undefined,
      status: statusInput ?? undefined,
      createBy: creatorInput.trim() || undefined,
    }))

  const reset = () => {
    setTitleInput('')
    setTypeInput(null)
    setStatusInput(null)
    setCreatorInput('')
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteNotices([deleting.notice_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    queryClient.invalidateQueries({ queryKey: ['notice-list'] })
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.notice_id) : Array.from(selected)).map(
      Number,
    )
    if (ids.length === 0) return
    try {
      await deleteNotices(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['notice-list'] })
  }

  const textCell = (value: unknown) => {
    const text = String(value ?? '—')
    const span = <span className="block max-w-[240px] truncate">{text}</span>
    if (value == null || value === '') return span
    return (
      <Tooltip>
        <TooltipTrigger>{span}</TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    )
  }

  const renderCell = (row: SysNoticeRow, key: string) => {
    switch (key) {
      case 'notice_title':
        return (
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                onClick={() => setViewing(row)}
                className="block max-w-[240px] cursor-pointer truncate text-start text-accent hover:underline"
              >
                {row.notice_title || '—'}
              </button>
            </TooltipTrigger>
            <TooltipContent>{row.notice_title || '—'}</TooltipContent>
          </Tooltip>
        )
      case 'notice_type':
        return (
          <Chip
            color={row.notice_type === '1' ? 'warning' : 'success'}
            size="sm"
            variant="soft"
          >
            {optionLabel(NOTICE_TYPE_OPTIONS, row.notice_type)}
          </Chip>
        )
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'danger'} size="sm" variant="soft">
            {optionLabel(NOTICE_STATUS_OPTIONS, row.status)}
          </Chip>
        )
      case 'create_by':
        return row.create_by || '—'
      case 'create_time':
        return String(row.create_time ?? '—').replace('T', ' ').slice(0, 19)
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            {hasPermission('system:notice:edit') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => navigate(`/system/notice/edit/${row.notice_id}`)}
                    aria-label="修改"
                  >
                    <SquarePen size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>修改</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('system:notice:remove') && (
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
          aria-label="按公告标题搜索"
          value={titleInput}
          onChange={setTitleInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">公告标题</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SelectRoot
          aria-label="公告类型"
          className="w-40"
          selectedKey={typeInput}
          onSelectionChange={(key) => {
            setTypeInput((key as string | null) ?? null)
          }}
        >
          <Label className="text-xs font-medium text-muted">公告类型</Label>
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
              {NOTICE_TYPE_OPTIONS.map((option) => (
                <ListBoxItem key={option.key} id={option.key}>
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <SelectRoot
          aria-label="公告状态"
          className="w-40"
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
              {NOTICE_STATUS_OPTIONS.map((option) => (
                <ListBoxItem key={option.key} id={option.key}>
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </SelectRoot>
        <SearchField
          aria-label="按创建者搜索"
          value={creatorInput}
          onChange={setCreatorInput}
          onSubmit={search}
          className="w-40"
        >
          <Label className="text-xs font-medium text-muted">创建者</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="回车搜索" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
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
        <Typography.Heading level={6} className="text-[13px] leading-4">通知公告</Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('system:notice:add') && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={() => navigate('/system/notice/new')}
            >
              <Plus size={12} className="size-3!" aria-hidden />
              新增公告
            </Button>
          )}
          {hasPermission('system:notice:remove') && (
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
              aria-label="通知公告列表"
              className="min-w-[960px]"
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
                items={rows.map((r) => ({ ...r, id: r.notice_id }))}
                dependencies={[visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <Megaphone size={20} aria-hidden className="text-muted" />
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
                        label={`选择 ${row.notice_title}`}
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

      <NoticeDetailDrawer notice={viewing} onClose={() => setViewing(null)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="公告"
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
                <AlertDialog.Heading>删除公告？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定删除公告「{deleting?.notice_title}」吗？该操作不可撤销。</p>
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
