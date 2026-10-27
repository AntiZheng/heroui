import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  TextField,
  toast,
} from '@heroui/react'
import { UserRound } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch, ReadOnlyInput } from '../../../components/FormSection'
import { useModalBackdropVariant } from '../../../components/useModalBackdrop'
import { addUser, editUser, getDeptTree } from '../../../api/user'
import { uploadAdminAvatar } from '../../../api/profile'
import { hasPermission } from '../../../stores/auth'
import { flattenDeptTree } from './deptTree'
import type { SysUserRow, UserPayload } from '../../../types/user'

interface Props {
  isOpen: boolean
  editing: SysUserRow | null
  onClose: () => void
}

const emptyForm = {
  userName: '',
  nickName: '',
  password: '',
  deptId: new Set<string>(),
  phonenumber: '',
  email: '',
  avatar: '',
  status: '0',
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

export default function UserFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [successName, setSuccessName] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const canUploadAvatar = hasPermission('file:upload')

  const { data: deptTreeData } = useQuery({ queryKey: ['dept-tree'], queryFn: getDeptTree })
  const deptOptions = useMemo(() => flattenDeptTree(deptTreeData ?? []), [deptTreeData])

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              userName: editing.user_name,
              nickName: editing.nick_name,
              password: '',
              deptId: new Set(editing.dept_id ? [String(editing.dept_id)] : []),
              phonenumber: editing.phonenumber ?? '',
              email: editing.email ?? '',
              avatar: editing.avatar ?? '',
              status: editing.status,
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!f) return
    if (f.size > MAX_AVATAR_SIZE) {
      toast('提示', { description: '头像不能超过 2MB', variant: 'warning' })
      return
    }
    setUploadingAvatar(true)
    try {
      const res = await uploadAdminAvatar(f)
      setForm((prev) => ({ ...prev, avatar: res.avatar }))
      toast('成功', { description: '头像已上传', variant: 'success' })
    } catch {
      return
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.userName || !form.nickName || form.deptId.size === 0) {
      toast('提示', { description: '请填写账号、昵称并选择部门', variant: 'warning' })
      return
    }
    if (!editing && !form.password) {
      toast('提示', { description: '新增用户必须填写密码', variant: 'warning' })
      return
    }
    setSaving(true)
    try {
      const payload: UserPayload = {
        userName: form.userName,
        nickName: form.nickName,
        deptId: Number(Array.from(form.deptId)[0]),
        roleIds: [],
        postIds: [],
        phonenumber: form.phonenumber || undefined,
        email: form.email || undefined,
        avatar: form.avatar || undefined,
        status: form.status,
      }
      if (editing) {
        await editUser({ ...payload, userId: editing.user_id })
        toast('成功', { description: '修改成功', variant: 'success' })
      } else {
        await addUser({ ...payload, password: form.password })
        setSuccessName(form.userName)
      }
      queryClient.invalidateQueries({ queryKey: ['user-list'] })
      queryClient.invalidateQueries({ queryKey: ['user-total'] })
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <FormModal
        isOpen={isOpen}
        onClose={onClose}
        title={editing ? '编辑用户' : '新增用户'}
        icon={UserRound}
        size="lg"
        saving={saving}
        onSubmit={handleSubmit}
      >
        <FormSection title="基础信息">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-sm font-medium text-muted">
              {form.avatar ? (
                <img
                  src={form.avatar}
                  alt="头像"
                  className="size-14 rounded-full object-cover"
                />
              ) : (
                (form.nickName.slice(0, 1) || 'U').toUpperCase()
              )}
            </div>
            {canUploadAvatar && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  isPending={uploadingAvatar}
                  onPress={() => avatarInputRef.current?.click()}
                >
                  上传头像
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarChange}
                />
              </>
            )}
            {form.avatar && (
              <Button
                variant="tertiary"
                size="sm"
                onPress={() => setForm((f) => ({ ...f, avatar: '' }))}
              >
                清除
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              value={form.userName}
              onChange={(v) => setForm((f) => ({ ...f, userName: v }))}
              isRequired
              isDisabled={!!editing}
            >
              <Label>账号</Label>
              {editing ? <ReadOnlyInput /> : <Input />}
            </TextField>
            <TextField
              value={form.nickName}
              onChange={(v) => setForm((f) => ({ ...f, nickName: v }))}
              isRequired
            >
              <Label>昵称</Label>
              <Input />
            </TextField>
            {!editing && (
              <TextField
                value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                isRequired
              >
                <Label>密码</Label>
                <Input type="password" />
              </TextField>
            )}
            <TextField
              value={form.phonenumber}
              onChange={(v) => setForm((f) => ({ ...f, phonenumber: v }))}
            >
              <Label>手机号</Label>
              <Input />
            </TextField>
            <TextField
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            >
              <Label>邮箱</Label>
              <Input />
            </TextField>
            <SelectRoot
              aria-label="部门"
              selectedKey={form.deptId.size > 0 ? Array.from(form.deptId)[0] : null}
              onSelectionChange={(key) =>
                setForm((f) => ({
                  ...f,
                  deptId: key != null ? new Set([String(key)]) : new Set<string>(),
                }))
              }
            >
              <Label>部门</Label>
              <SelectTrigger>
                <SelectValue />
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {deptOptions.map((dept) => (
                    <ListBoxItem key={String(dept.id)} id={String(dept.id)}>
                      {dept.label}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </SelectPopover>
            </SelectRoot>
          </div>
        </FormSection>

        <FormSection title="账号状态" tone="success">
          <FormSwitch
            label="启用账号"
            isSelected={form.status === '0'}
            onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
          />
        </FormSection>
      </FormModal>

      <AlertDialog
        isOpen={successName !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSuccessName(null)
        }}
      >
        <AlertDialog.Backdrop variant={backdropVariant}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="success" />
                <AlertDialog.Heading>新增成功</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>用户「{successName}」已创建。</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="primary" size="sm">
                  确定
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  )
}
