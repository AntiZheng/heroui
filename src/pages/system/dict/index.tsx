import { useEffect, useMemo, useRef, useState } from 'react'
import type { Selection } from 'react-aria-components'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
import {
  BookA,
  BookText,
  RotateCcw,
  Search,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { deleteDictTypes, getDictTypeList, type DictTypeListQuery } from '../../../api/dict'
import { hasPermission } from '../../../stores/auth'
import BatchDeleteDialog from '../../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../../components/ColumnSettings'
import TableCornerOverlays from '../../../components/TableCornerOverlays'
import SelectionCheckbox from '../../../components/SelectionCheckbox'
import PageSizeStepper from '../../../components/PageSizeStepper'
import type { SysDictTypeRow } from '../../../types/dict'
import DictTypeFormModal from './DictTypeFormModal'

const PAGE_SIZE = 10

const columns = [
  { key: 'dict_id', label: '字典编号' },
  { key: 'dict_name', label: '字典名称' },
  { key: 'dict_type', label: '字典类型' },
  { key: 'status', label: '状态' },
  { key: 'remark', label: '备注' },
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

export default function DictPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState<DictTypeListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [nameInput, setNameInput] = useState('')
  const [typeInput, setTypeInput] = useState('')
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [jumpTo, setJumpTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysDictTypeRow | null>(null)
  const [deleting, setDeleting] = useState<SysDictTypeRow | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'dict-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data, isPending } = useQuery({
    queryKey: ['dict-type-list', query],
    queryFn: () => getDictTypeList(query),
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
      dictName: nameInput || undefined,
      dictType: typeInput || undefined,
      status: statusInput ?? undefined,
    }))

  const reset = () => {
    setNameInput('')
    setTypeInput('')
    setStatusInput(null)
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteDictTypes([deleting.dict_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    queryClient.invalidateQueries({ queryKey: ['dict-type-list'] })
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.dict_id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteDictTypes(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['dict-type-list'] })
  }

  const renderCell = (row: SysDictTypeRow, key: string) => {
    switch (key) {
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
            {hasPermission('system:dict:edit') && (
              <>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      className="rounded-full!"
                      onPress={() => navigate(`/system/dict/data/${row.dict_type}`)}
                      aria-label="字典数据"
                    >
                      <BookText size={12} className="size-3!" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>字典数据</TooltipContent>
                </Tooltip>
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
              </>
            )}
            {hasPermission('system:dict:remove') && (
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
            aria-label="按字典名称搜索"
            value={nameInput}
            onChange={setNameInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">字典名称</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="回车搜索" className="text-xs!" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SearchField
            aria-label="按字典类型搜索"
            value={typeInput}
            onChange={setTypeInput}
            onSubmit={search}
            className="w-48"
          >
            <Label className="text-xs font-medium text-muted">字典类型</Label>
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
          <Typography.Heading level={6} className="text-[13px] leading-4">字典类型</Typography.Heading>
          <div className="flex items-center gap-2">
            {hasPermission('system:dict:add') && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
                onPress={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <BookA size={12} className="size-3!" aria-hidden />
                新增字典类型
              </Button>
            )}
            {hasPermission('system:dict:remove') && (
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
              aria-label="字典类型列表"
              className="min-w-[860px]"
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
                items={rows.map((r) => ({ ...r, id: r.dict_id }))}
                dependencies={[visibleColumns]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <BookA size={20} aria-hidden className="text-muted" />
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
                      <SelectionCheckbox label={`选择 ${row.dict_name}`} />
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

      <DictTypeFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="字典类型"
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
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
                <AlertDialog.Heading>删除字典类型？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>确定删除字典类型「{deleting?.dict_name}」吗？建议先清空其下字典数据。</p>
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
