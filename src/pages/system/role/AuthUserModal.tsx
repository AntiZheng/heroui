import { useEffect, useState } from 'react'
import type { Selection } from 'react-aria-components'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  EmptyState,
  Label,
  SearchField,
  Spinner,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRoot,
  TableRow,
  Tabs,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
  toast,
} from '@heroui/react'
import { UserMinus, UserPlus, Users } from 'lucide-react'
import {
  cancelAllAuthUsers,
  cancelAuthUser,
  getAllocatedUsers,
  getUnallocatedUsers,
  selectAllAuthUsers,
  type AuthUserQuery,
} from '../../../api/role'
import type { SysRoleRow } from '../../../types/role'
import type { SysUserRow } from '../../../types/user'
import FormModal from '../../../components/FormModal'
import SelectionCheckbox from '../../../components/SelectionCheckbox'

interface Props {
  isOpen: boolean
  role: SysRoleRow | null
  onClose: () => void
}

const PAGE_SIZE = 10

export default function AuthUserModal({ isOpen, role, onClose }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('allocated')
  const [pageNum, setPageNum] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<AuthUserQuery>({} as AuthUserQuery)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [acting, setActing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setTab('allocated')
      setPageNum(1)
      setKeyword('')
      setFilters({} as AuthUserQuery)
      setSelected(new Set())
    }
  }, [isOpen, role?.role_id])

  const params: AuthUserQuery = { ...filters, pageNum, pageSize: PAGE_SIZE }

  const { data: allocated, isPending: loadingAllocated } = useQuery({
    queryKey: ['role-auth-allocated', role?.role_id, params],
    queryFn: () => getAllocatedUsers(role!.role_id, params),
    enabled: isOpen && !!role,
    placeholderData: (prev) => prev,
  })

  const { data: unallocated, isPending: loadingUnallocated } = useQuery({
    queryKey: ['role-auth-unallocated', role?.role_id, params],
    queryFn: () => getUnallocatedUsers(role!.role_id, params),
    enabled: isOpen && !!role,
    placeholderData: (prev) => prev,
  })

  const isAllocatedTab = tab === 'allocated'
  const active = isAllocatedTab ? allocated : unallocated
  const rows = active?.rows ?? []
  const total = active?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['role-auth-allocated', role?.role_id] })
    queryClient.invalidateQueries({ queryKey: ['role-auth-unallocated', role?.role_id] })
  }

  const selectedIds =
    selected === 'all' ? rows.map((r) => r.user_id) : [...selected].map(Number)

  const run = async (fn: () => Promise<unknown>, successMsg: string) => {
    setActing(true)
    try {
      await fn()
      toast('成功', { description: successMsg, variant: 'success' })
      setSelected(new Set())
      invalidate()
    } catch {
      return
    } finally {
      setActing(false)
    }
  }

  const handleBatch = () => {
    if (!role || selectedIds.length === 0) {
      toast('提示', { description: '请先勾选用户', variant: 'warning' })
      return
    }
    const ids = selectedIds
    if (isAllocatedTab) {
      void run(() => cancelAllAuthUsers(role.role_id, ids), '取消授权成功')
    } else {
      void run(() => selectAllAuthUsers(role.role_id, ids), '授权成功')
    }
  }

  // 固定按账号搜索
  const search = () => {
    const q = keyword.trim()
    setPageNum(1)
    setFilters((q ? { userName: q } : {}) as AuthUserQuery)
  }

  const changeKeyword = (value: string) => {
    setKeyword(value)
    if (!value) {
      setPageNum(1)
      setFilters({} as AuthUserQuery)
    }
  }

  const switchTab = (key: string | null) => {
    if (!key) return
    setTab(key)
    setPageNum(1)
    setKeyword('')
    setFilters({} as AuthUserQuery)
    setSelected(new Set())
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title="分配用户"
      meta={`角色：${role?.role_name ?? ''}`}
      icon={Users}
      size="lg"
      footer={
        <Button variant="tertiary" size="sm" onPress={onClose}>
          关闭
        </Button>
      }
    >
      <Tabs
        selectedKey={tab}
        className="mx-auto w-fit"
        onSelectionChange={(key) => {
          if (key != null) switchTab(String(key))
        }}
      >
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="allocated" className="gap-1">
              已分配用户
              {allocated && (
                <Badge
                  size="sm"
                  variant="soft"
                  color="success"
                  className="static! transform-none!"
                >
                  {allocated.total}
                </Badge>
              )}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="unallocated" className="gap-1">
              未分配用户
              {unallocated && (
                <Badge
                  size="sm"
                  variant="soft"
                  color="warning"
                  className="static! transform-none!"
                >
                  {unallocated.total}
                </Badge>
              )}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          aria-label="按账号搜索"
          value={keyword}
          onChange={changeKeyword}
          onSubmit={search}
          className="w-64"
        >
          <Label className="text-xs font-medium text-muted">账号</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Button
          variant={isAllocatedTab ? 'danger-soft' : 'secondary'}
          size="sm"
          className={
            isAllocatedTab
              ? 'ml-auto'
              : 'ml-auto bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!'
          }
          isPending={acting}
          onPress={handleBatch}
        >
          {isAllocatedTab ? (
            <UserMinus size={12} className="size-3!" aria-hidden />
          ) : (
            <UserPlus size={12} className="size-3!" aria-hidden />
          )}
          {isAllocatedTab ? '批量取消授权' : '批量授权'}
        </Button>
      </div>

      <div className="cursor-default overflow-hidden rounded-xl border border-accent/20 [&_th]:bg-accent-soft/60">
        <TableRoot variant="secondary">
          <TableContent
            aria-label={isAllocatedTab ? '已分配用户' : '未分配用户'}
            selectionMode="multiple"
            selectionBehavior="toggle"
            selectedKeys={selected}
            onSelectionChange={setSelected}
          >
            <TableHeader>
              <TableColumn id="select">
                <SelectionCheckbox label="全选本页" />
              </TableColumn>
              <TableColumn id="user_name" isRowHeader>
                账号
              </TableColumn>
              <TableColumn id="nick_name">昵称</TableColumn>
              <TableColumn id="phonenumber">手机号</TableColumn>
              <TableColumn id="action">操作</TableColumn>
            </TableHeader>
            <TableBody
              items={rows.map((r) => ({ ...r, id: r.user_id }))}
              dependencies={[tab]}
              renderEmptyState={() =>
                (isAllocatedTab ? loadingAllocated : loadingUnallocated) ? (
                  <Spinner />
                ) : (
                  <EmptyState className="flex flex-col items-center justify-center gap-2 py-8">
                    <Users size={20} aria-hidden className="text-muted" />
                    <Typography.Paragraph size="sm" color="muted">
                      暂无数据
                    </Typography.Paragraph>
                  </EmptyState>
                )
              }
            >
              {(row: SysUserRow & { id: number }) => (
                <TableRow id={row.id}>
                  <TableCell>
                    <SelectionCheckbox
                      label={`选择 ${row.user_name}`}
                      variant="secondary"
                    />
                  </TableCell>
                  <TableCell>{row.user_name}</TableCell>
                  <TableCell>{row.nick_name}</TableCell>
                  <TableCell>{row.phonenumber ?? '—'}</TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          size="sm"
                          variant={isAllocatedTab ? 'danger-soft' : 'tertiary'}
                          isIconOnly
                          className="rounded-full!"
                          isPending={acting}
                          aria-label={isAllocatedTab ? '取消授权' : '授权'}
                          onPress={() =>
                            isAllocatedTab
                              ? run(
                                  () => cancelAuthUser(row.user_id, role!.role_id),
                                  '取消授权成功',
                                )
                              : run(
                                  () => selectAllAuthUsers(role!.role_id, [row.user_id]),
                                  '授权成功',
                                )
                          }
                        >
                          {isAllocatedTab ? (
                            <UserMinus size={12} className="size-3!" aria-hidden />
                          ) : (
                            <UserPlus size={12} className="size-3!" aria-hidden />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isAllocatedTab ? '取消授权' : '授权'}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableRoot>
      </div>

      <div className="flex cursor-default items-center justify-between text-xs text-muted">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            isDisabled={pageNum <= 1}
            onPress={() => setPageNum((p) => p - 1)}
          >
            上一页
          </Button>
          <span>
            {pageNum} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={pageNum >= totalPages}
            onPress={() => setPageNum((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </FormModal>
  )
}
