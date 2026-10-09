import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react'
import { getDeptTree, getUserList } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import { flattenDeptTree } from './deptTree'
import RowActions from './RowActions'
import UserFormModal from './UserFormModal'
import type { UserListQuery } from '../../../api/user'
import type { SysUserRow } from '../../../types/user'

const PAGE_SIZE = 10

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

  const renderCell = (row: SysUserRow, key: string) => {
    switch (key) {
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'default'} size="sm" variant="flat">
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
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-row flex-wrap items-end gap-3">
          <Input
            label="账号"
            value={userNameInput}
            onValueChange={setUserNameInput}
            className="w-48"
          />
          <Input
            label="手机号"
            value={phoneInput}
            onValueChange={setPhoneInput}
            className="w-48"
          />
          <Select
            label="部门"
            className="w-48"
            selectedKeys={query.deptId ? [String(query.deptId)] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0] as string | undefined
              setQuery((q) => ({ ...q, pageNum: 1, deptId: key ? Number(key) : undefined }))
            }}
          >
            {(deptOptions ?? []).map((dept) => (
              <SelectItem key={String(dept.id)}>{dept.label}</SelectItem>
            ))}
          </Select>
          <Button color="primary" onPress={search}>
            搜索
          </Button>
          <Button variant="flat" onPress={reset}>
            重置
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-medium font-medium">用户列表</h2>
            <div className="flex items-center gap-3">
              <span className="text-small text-foreground-500">共 {data?.total ?? 0} 条</span>
              {hasPermission('system:user:add') && (
                <Button color="primary" onPress={openCreate}>
                  新增用户
                </Button>
              )}
            </div>
          </div>
          <Table aria-label="用户列表" isStriped>
            <TableHeader columns={columns}>
              {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
            </TableHeader>
            <TableBody
              items={data?.rows ?? []}
              emptyContent="暂无数据"
              isLoading={isPending}
            >
              {(row) => (
                <TableRow key={row.user_id}>
                  {(columnKey) => <TableCell>{renderCell(row, String(columnKey))}</TableCell>}
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-center">
            <Pagination
              total={totalPages}
              page={query.pageNum}
              onChange={(page) => setQuery((q) => ({ ...q, pageNum: page }))}
            />
          </div>
        </CardBody>
      </Card>

      <UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}
