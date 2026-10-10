import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationRoot,
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
  TextField,
} from '@heroui/react'
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

export default function UserPage() {
  const [query, setQuery] = useState<UserListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
    [data?.total],
  )

  const search = () =>
    setQuery((q) => ({ ...q, pageNum: 1, userName: userNameInput, phonenumber: phoneInput }))

  const reset = () => {
    setUserNameInput('')
    setPhoneInput('')
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
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
          <TextField value={userNameInput} onChange={setUserNameInput} className="w-48">
            <Label>账号</Label>
            <Input />
          </TextField>
          <TextField value={phoneInput} onChange={setPhoneInput} className="w-48">
            <Label>手机号</Label>
            <Input />
          </TextField>
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
              <SelectValue />
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              {/* RAC 的选择键取自 id prop；React key 会被拦截导致 onSelectionChange 收到自动生成的非数字键 */}
              <ListBox>
                {(deptOptions ?? []).map((dept) => (
                  <ListBoxItem key={String(dept.id)} id={String(dept.id)}>{dept.label}</ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </SelectRoot>
          <Button variant="primary" onPress={search}>
            搜索
          </Button>
          <Button variant="secondary" onPress={reset}>
            重置
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">用户列表</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">共 {data?.total ?? 0} 条</span>
              {hasPermission('system:user:add') && (
                <Button variant="primary" onPress={openCreate}>
                  新增用户
                </Button>
              )}
            </div>
          </div>
          <TableRoot>
            <TableContent aria-label="用户列表">
              <TableHeader>
                {columns.map((col) => (
                  <TableColumn key={col.key} isRowHeader={col.key === 'user_name'}>
                    {col.label}
                  </TableColumn>
                ))}
              </TableHeader>
              <TableBody
                items={rowsWithId}
                renderEmptyState={() => (isPending ? <Spinner /> : '暂无数据')}
              >
                {(row) => (
                  <TableRow>
                    <TableCell>{renderCell(row, 'user_id')}</TableCell>
                    <TableCell>{renderCell(row, 'user_name')}</TableCell>
                    <TableCell>{renderCell(row, 'nick_name')}</TableCell>
                    <TableCell>{renderCell(row, 'phonenumber')}</TableCell>
                    <TableCell>{renderCell(row, 'status')}</TableCell>
                    <TableCell>{renderCell(row, 'create_time')}</TableCell>
                    <TableCell>{renderCell(row, 'actions')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableRoot>
          <div className="flex justify-center">
            <PaginationRoot>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    isDisabled={query.pageNum <= 1}
                    onPress={() => setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }))}
                  >
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
                  </PaginationNext>
                </PaginationItem>
              </PaginationContent>
            </PaginationRoot>
          </div>
        </CardContent>
      </Card>

      <UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}
