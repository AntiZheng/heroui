import { useEffect, useMemo, useRef, useState } from 'react'
import type { Selection } from 'react-aria-components'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
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
  TextField,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
  toast,
} from '@heroui/react'
import { Copy, KeyRound, RotateCcw, Search, SquarePen, Trash2 } from 'lucide-react'
import {
  addApiKey,
  deleteApiKeys,
  editApiKey,
  getApiKeyList,
  resetApiKey,
  type ApiKeyListQuery,
} from '../../api/apiKey'
import { getFileFolders } from '../../api/file'
import { hasPermission } from '../../stores/auth'
import { API_KEY_SCOPE_LABELS } from '../../types/apiKey'
import type { ApiKeyScope, SysApiKeyRow } from '../../types/apiKey'
import type { FileFolder } from '../../types/file'
import FormModal from '../../components/FormModal'
import { FormSection } from '../../components/FormSection'
import BatchDeleteDialog from '../../components/BatchDeleteDialog'
import { ColumnSettings, useColPrefs, useStickyColumns } from '../../components/ColumnSettings'
import TableCornerOverlays from '../../components/TableCornerOverlays'
import SelectionCheckbox from '../../components/SelectionCheckbox'
import PageSizeStepper from '../../components/PageSizeStepper'
import { useModalBackdropVariant } from '../../components/useModalBackdrop'
import { copyText, formatSize, formatTime } from './fileUtils'

const PAGE_SIZE = 10

const SCOPES = Object.keys(API_KEY_SCOPE_LABELS) as ApiKeyScope[]

const columns = [
  { key: 'key_name', label: '名称' },
  { key: 'access_key', label: 'Access Key' },
  { key: 'scopes', label: '权限' },
  { key: 'folder', label: '命名空间' },
  { key: 'quota', label: '配额用量' },
  { key: 'status', label: '状态' },
  { key: 'expires_at', label: '过期时间' },
  { key: 'last_used', label: '最后使用' },
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

/** 状态开关：56×20、内嵌文字、整块可点（对齐岗位/定时任务页） */
function ApiKeyStatusSwitch({ row }: { row: SysApiKeyRow }) {
  const [status, setStatus] = useState(row.status)
  const active = status === '0'
  const label = active ? '启用' : '停用'

  const handleChange = async (checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await editApiKey({ keyId: row.key_id, status: next })
      setStatus(next)
      toast('成功', { description: '状态修改成功', variant: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  if (!hasPermission('file:key:edit')) {
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
      onChange={handleChange}
      aria-label={`密钥状态 ${label}`}
      className="group w-fit [--switch-control-bg:var(--danger-soft)] [--switch-control-bg-hover:var(--danger-soft-hover)] [--switch-control-bg-checked:var(--success-soft)] [--switch-control-bg-checked-hover:var(--success-soft-hover)]"
    >
      <SwitchContent className="w-fit text-[12px]!">
        <SwitchControl className="h-5! w-14! rounded-full!">
          <SwitchThumb className="size-4! rounded-full! group-data-[selected=true]:ms-[calc(100%-1.25rem)]" />
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
        <span className="sr-only">密钥状态 {label}</span>
      </SwitchContent>
    </Switch>
  )
}

/** 配额用量：quota_bytes 为 0 = 不限（只显示已用，不显示进度条）；超 90% 用 warning 色 */
function QuotaCell({ row }: { row: SysApiKeyRow }) {
  const used = row.used_bytes ?? 0
  if (!row.quota_bytes) {
    return <span className="whitespace-nowrap text-muted">已用 {formatSize(used)}</span>
  }
  const pct = Math.min(100, (used / row.quota_bytes) * 100)
  const warn = pct > 90
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="whitespace-nowrap">
        {formatSize(used)} / {formatSize(row.quota_bytes)}
      </span>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-surface-secondary"
      >
        <div
          className={`h-full rounded-full ${warn ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

interface SecretDialogState {
  /** create 展示完整 ak.sk；reset 只展示新 secret */
  text: string
  kind: 'create' | 'reset'
}

interface ApiKeyFormState {
  keyName: string
  scopes: ApiKeyScope[]
  folderName: string
  quotaMb: string
  expiresAt: string
  remark: string
}

const emptyForm: ApiKeyFormState = {
  keyName: '',
  scopes: [],
  folderName: '',
  quotaMb: '0',
  expiresAt: '',
  remark: '',
}

function ApiKeyFormModal({
  isOpen,
  editing,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  editing: SysApiKeyRow | null
  onClose: () => void
  onCreated: (state: SecretDialogState) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ApiKeyFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              keyName: editing.key_name,
              scopes: editing.scopes ?? [],
              folderName: '',
              quotaMb: String(editing.quota_mb ?? 0),
              expiresAt: editing.expires_at ? String(editing.expires_at).slice(0, 10) : '',
              remark: editing.remark ?? '',
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const toggleScope = (scope: ApiKeyScope, checked: boolean) =>
    setForm((f) => ({
      ...f,
      scopes: checked
        ? f.scopes.includes(scope)
          ? f.scopes
          : [...f.scopes, scope]
        : f.scopes.filter((s) => s !== scope),
    }))

  const handleSubmit = async () => {
    if (!form.keyName.trim()) {
      toast('提示', { description: '请填写名称', variant: 'warning' })
      return
    }
    const quotaMb = Math.max(0, Math.floor(Number(form.quotaMb) || 0))
    setSaving(true)
    try {
      if (editing) {
        await editApiKey({
          keyId: editing.key_id,
          keyName: form.keyName.trim(),
          scopes: form.scopes,
          quotaMb,
          expiresAt: form.expiresAt || null,
          remark: form.remark || undefined,
        })
        toast('成功', { description: '修改密钥成功', variant: 'success' })
      } else {
        const res = await addApiKey({
          keyName: form.keyName.trim(),
          scopes: form.scopes,
          folderName: form.folderName.trim() || undefined,
          quotaMb,
          expiresAt: form.expiresAt || undefined,
          remark: form.remark || undefined,
        })
        toast('成功', { description: '新增密钥成功', variant: 'success' })
        // 完整密钥仅经弹窗一次性展示，不落入其他状态
        onCreated({ text: `${res.key.access_key}.${res.secret}`, kind: 'create' })
      }
      queryClient.invalidateQueries({ queryKey: ['api-key-list'] })
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '编辑密钥' : '新增 Key'}
      icon={KeyRound}
      size="md"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基础信息">
        <div className="flex flex-col gap-4">
          <TextField value={form.keyName} onChange={(v) => setForm((f) => ({ ...f, keyName: v }))} isRequired>
            <Label>名称</Label>
            <Input />
          </TextField>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">权限</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SCOPES.map((scope) => (
                <Checkbox
                  key={scope}
                  isSelected={form.scopes.includes(scope)}
                  onChange={(checked) => toggleScope(scope, checked)}
                  aria-label={API_KEY_SCOPE_LABELS[scope]}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {API_KEY_SCOPE_LABELS[scope]}
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
          </div>
          {!editing && (
            <TextField
              value={form.folderName}
              onChange={(v) => setForm((f) => ({ ...f, folderName: v }))}
            >
              <Label>命名空间名称</Label>
              <Input placeholder={`默认 API-${form.keyName.trim() || '…'}`} />
            </TextField>
          )}
        </div>
      </FormSection>

      <FormSection title="高级设置">
        <div className="flex flex-col gap-4">
          <TextField
            value={form.quotaMb}
            onChange={(v) => setForm((f) => ({ ...f, quotaMb: v }))}
          >
            <Label>配额（MB）</Label>
            <Input inputMode="numeric" placeholder="0 = 不限" />
          </TextField>
          <TextField
            value={form.expiresAt}
            onChange={(v) => setForm((f) => ({ ...f, expiresAt: v }))}
          >
            <Label>过期时间</Label>
            <Input type="date" />
          </TextField>
          <TextField value={form.remark} onChange={(v) => setForm((f) => ({ ...f, remark: v }))}>
            <Label>备注</Label>
            <Input />
          </TextField>
        </div>
      </FormSection>
    </FormModal>
  )
}

/** 一次性密钥弹窗：完整密钥仅此一次显示 */
function SecretDialog({
  state,
  onClose,
}: {
  state: SecretDialogState | null
  onClose: () => void
}) {
  const backdropVariant = useModalBackdropVariant()
  return (
    <AlertDialog
      isOpen={state !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <AlertDialog.Backdrop variant={backdropVariant}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="success" />
              <AlertDialog.Heading>
                {state?.kind === 'reset' ? '密钥已重置' : '密钥创建成功'}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg bg-surface-secondary p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm leading-5">
                  {state?.text}
                </code>
                {state && (
                  <Button
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    className="rounded-full!"
                    aria-label="复制完整密钥"
                    onPress={() => void copyText(state.text, '密钥已复制')}
                  >
                    <Copy size={12} className="size-3!" aria-hidden />
                  </Button>
                )}
              </div>
              <p className="text-xs text-warning">完整密钥仅此一次显示，请立即保存。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" size="sm" variant="primary" onPress={onClose}>
                我已保存
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

export default function ApiKeyPage() {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [query, setQuery] = useState<ApiKeyListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [nameInput, setNameInput] = useState('')
  const [statusInput, setStatusInput] = useState<string | null>(null)
  const [jumpTo, setJumpTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SysApiKeyRow | null>(null)
  const [deleting, setDeleting] = useState<SysApiKeyRow | null>(null)
  const [resetting, setResetting] = useState<SysApiKeyRow | null>(null)
  const [secretDialog, setSecretDialog] = useState<SecretDialogState | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  const tableAreaRef = useRef<HTMLDivElement>(null)
  const colCtrl = useColPrefs({ storageKey: 'api-key-table-cols', columns, fixedKeys: ['actions'] })
  const visibleColumns = colCtrl.visibleColumns
  const { stickyColProps } = useStickyColumns({
    containerRef: tableAreaRef,
    visibleColumns,
    pinnedSet: colCtrl.pinnedSet,
  })

  const { data: folders } = useQuery({
    queryKey: ['file-folders'],
    queryFn: getFileFolders,
  })

  const { data, isPending } = useQuery({
    queryKey: ['api-key-list', query],
    queryFn: () => getApiKeyList(query),
    placeholderData: keepPreviousData,
  })

  const rows = useMemo(() => data?.rows ?? [], [data])
  const pageSize = query.pageSize ?? PAGE_SIZE

  // folder_id → 命名空间路径（folder_path 优先，回退 folder_name）
  const folderLabelById = useMemo(
    () =>
      new Map<number, string>(
        (folders ?? []).map((f: FileFolder) => [f.folder_id, f.folder_path || f.folder_name]),
      ),
    [folders],
  )

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
      keyName: nameInput || undefined,
      status: statusInput ?? undefined,
    }))

  const reset = () => {
    setNameInput('')
    setStatusInput(null)
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['api-key-list'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteApiKeys([deleting.key_id])
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setDeleting(null)
    invalidateList()
  }

  const handleBatchDelete = async () => {
    const ids = (selected === 'all' ? rows.map((r) => r.key_id) : Array.from(selected)).map(Number)
    if (ids.length === 0) return
    try {
      await deleteApiKeys(ids)
    } catch {
      return
    }
    toast('成功', { description: '删除成功', variant: 'success' })
    setSelected(new Set())
    invalidateList()
  }

  const handleReset = async () => {
    if (!resetting) return
    try {
      const res = await resetApiKey(resetting.key_id)
      setResetting(null)
      setSecretDialog({ text: res.secret, kind: 'reset' })
      invalidateList()
    } catch {
      return
    }
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

  const renderCell = (row: SysApiKeyRow, key: string) => {
    switch (key) {
      case 'access_key':
        return (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger>
                <span className="block max-w-[150px] truncate font-mono text-[13px]">
                  {row.access_key}
                </span>
              </TooltipTrigger>
              <TooltipContent>{row.access_key}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  size="sm"
                  variant="tertiary"
                  isIconOnly
                  className="rounded-full!"
                  aria-label="复制 Access Key"
                  onPress={() => void copyText(row.access_key, 'Access Key 已复制')}
                >
                  <Copy size={12} className="size-3!" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制</TooltipContent>
            </Tooltip>
          </div>
        )
      case 'scopes':
        return (
          <div className="flex flex-wrap gap-1">
            {(row.scopes ?? []).map((scope) => (
              <Chip key={scope} color="success" size="sm" variant="soft">
                {API_KEY_SCOPE_LABELS[scope] ?? scope}
              </Chip>
            ))}
          </div>
        )
      case 'folder':
        return textCell(row.folder_id ? folderLabelById.get(row.folder_id) ?? null : null)
      case 'quota':
        return <QuotaCell row={row} />
      case 'status':
        return <ApiKeyStatusSwitch key={row.key_id} row={row} />
      case 'expires_at':
        return textCell(row.expires_at ? formatTime(row.expires_at).slice(0, 10) : null)
      case 'last_used':
        return row.last_used_at ? (
          <span className="flex flex-col leading-4">
            <span className="whitespace-nowrap">{formatTime(row.last_used_at)}</span>
            {row.last_used_ip && (
              <span className="text-xs text-muted">{row.last_used_ip}</span>
            )}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            {hasPermission('file:key:reset') && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    className="rounded-full!"
                    onPress={() => setResetting(row)}
                    aria-label="重置密钥"
                  >
                    <KeyRound size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>重置密钥</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('file:key:edit') && (
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
                    aria-label="编辑"
                  >
                    <SquarePen size={12} className="size-3!" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑</TooltipContent>
              </Tooltip>
            )}
            {hasPermission('file:key:delete') && (
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
      {/* 搜索行 */}
      <div className="flex flex-row flex-wrap items-end gap-3 border-b border-separator pb-4">
        <SearchField
          aria-label="按名称搜索"
          value={nameInput}
          onChange={setNameInput}
          onSubmit={search}
          className="w-48"
        >
          <Label className="text-xs font-medium text-muted">名称</Label>
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
          onSelectionChange={(key) => setStatusInput((key as string | null) ?? null)}
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
              <ListBoxItem id="0">启用</ListBoxItem>
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

      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <Typography.Heading level={6} className="text-[13px] leading-4">
          API 密钥
        </Typography.Heading>
        <div className="flex items-center gap-2">
          {hasPermission('file:key:add') && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
              onPress={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <KeyRound size={12} className="size-3!" aria-hidden />
              新增 Key
            </Button>
          )}
          {hasPermission('file:key:delete') && (
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

      {/* 表格区 */}
      <div ref={tableAreaRef} className="flex min-h-0 flex-col">
        <TableRoot className="flex! min-h-0 flex-col shadow-sm">
          <TableScrollContainer className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
            <TableCornerOverlays />
            <TableContent
              aria-label="API 密钥列表"
              className="min-w-[1180px]"
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
                items={rows.map((r) => ({ ...r, id: r.key_id }))}
                dependencies={[visibleColumns, folderLabelById]}
                renderEmptyState={() =>
                  isPending ? (
                    <Spinner />
                  ) : (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                      <KeyRound size={20} aria-hidden className="text-muted" />
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
                      <SelectionCheckbox label={`选择 ${row.key_name}`} variant="secondary" />
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

      {/* 分页 */}
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

      {/* 弹窗挂载 */}
      <ApiKeyFormModal
        isOpen={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onCreated={setSecretDialog}
      />

      <SecretDialog state={secretDialog} onClose={() => setSecretDialog(null)} />

      <BatchDeleteDialog
        isOpen={batchOpen}
        count={batchCount}
        label="密钥"
        onClose={() => setBatchOpen(false)}
        onConfirm={handleBatchDelete}
      />

      {/* 重置确认 */}
      <AlertDialog
        isOpen={resetting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setResetting(null)
        }}
      >
        <AlertDialog.Backdrop variant={backdropVariant}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>重置密钥？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  确定重置「{resetting?.key_name}」的密钥吗？原密钥将立即失效，新密钥仅展示一次。
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" size="sm" variant="tertiary">
                  取消
                </Button>
                <Button slot="close" size="sm" variant="danger" onPress={handleReset}>
                  重置
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* 删除确认 */}
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
                <AlertDialog.Heading>删除密钥？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  确定删除密钥「{deleting?.key_name}
                  」吗？删除后 Key 立即失效，已上传文件与命名空间目录将保留。
                </p>
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
