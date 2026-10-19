import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
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
  const [nameInput, setNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [filters, setFilters] = useState<AuthUserQuery>({} as AuthUserQuery)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [acting, setActing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setTab('allocated')
      setPageNum(1)
      setNameInput('')
      setPhoneInput('')
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

  const toggleRow = (id: number, sel: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (sel) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.user_id))
  const toggleAllPage = (sel: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      rows.forEach((r) => (sel ? next.add(r.user_id) : next.delete(r.user_id)))
      return next
    })
  }

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
    if (!role || selected.size === 0) {
      toast('提示', { description: '请先勾选用户', variant: 'warning' })
      return
    }
    const ids = [...selected]
    if (isAllocatedTab) {
      void run(() => cancelAllAuthUsers(role.role_id, ids), '取消授权成功')
    } else {
      void run(() => selectAllAuthUsers(role.role_id, ids), '授权成功')
    }
  }

  const search = () =>
    setFilters({ pageNum: 1, pageSize: PAGE_SIZE, userName: nameInput || undefined, phonenumber: phoneInput || undefined })

  const switchTab = (key: string | null) => {
    if (!key) return
    setTab(key)
    setPageNum(1)
    setNameInput('')
    setPhoneInput('')
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
        onSelectionChange={(key) => {
          if (key != null) switchTab(String(key))
        }}
      >
        <Tabs.List>
          <Tabs.Tab id="allocated">已分配用户</Tabs.Tab>
          <Tabs.Tab id="unallocated">未分配用户</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          aria-label="按账号搜索"
          value={nameInput}
          onChange={setNameInput}
          onSubmit={search}
          className="w-44"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索账号" className="text-xs!" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SearchField
          aria-label="按手机号搜索"
          value={phoneInput}
          onChange={setPhoneInput}
          onSubmit={search}
          className="w-44"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索手机号" className="text-xs!" />
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
          <TableContent aria-label={isAllocatedTab ? '已分配用户' : '未分配用户'}>
            <TableHeader>
              <TableColumn id="select">
                <Checkbox
                  aria-label="全选本页"
                  isSelected={allPageSelected}
                  onChange={toggleAllPage}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
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
              dependencies={[tab, selected]}
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
                    <Checkbox
                      aria-label={`选择 ${row.user_name}`}
                      variant="secondary"
                      isSelected={selected.has(row.user_id)}
                      onChange={(sel) => toggleRow(row.user_id, sel)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
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
