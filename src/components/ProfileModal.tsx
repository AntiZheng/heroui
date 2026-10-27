import { useEffect, useRef, useState } from 'react'
import { Button, Input, Label, TextField, toast } from '@heroui/react'
import { Upload, UserRound } from 'lucide-react'
import FormModal from './FormModal'
import { FormSection } from './FormSection'
import { updateProfileInfo, uploadMyAvatar } from '../api/profile'
import { useAuthStore } from '../stores/auth'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ProfileModal({ isOpen, onClose }: Props) {
  const user = useAuthStore((s) => s.user)
  const roles = useAuthStore((s) => s.roles)
  const permissions = useAuthStore((s) => s.permissions)
  const setUserInfo = useAuthStore((s) => s.setUserInfo)

  const [nickName, setNickName] = useState('')
  const [email, setEmail] = useState('')
  const [phonenumber, setPhonenumber] = useState('')
  const [avatar, setAvatar] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 打开时从 auth store 回填
  useEffect(() => {
    if (!isOpen) return
    setNickName(user?.nick_name ?? '')
    setEmail(typeof user?.email === 'string' ? user.email : '')
    setPhonenumber(typeof user?.phonenumber === 'string' ? user.phonenumber : '')
    setAvatar(typeof user?.avatar === 'string' ? (user.avatar ?? '') : '')
    setFile(null)
    setPreviewUrl('')
  }, [isOpen, user])

  // 预览 URL 生命周期管理：替换/关闭/卸载时释放
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const displayAvatar = file ? previewUrl : avatar

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!f) return
    if (f.size > MAX_AVATAR_SIZE) {
      toast('提示', { description: '头像不能超过 2MB', variant: 'warning' })
      return
    }
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const handleClear = () => {
    setFile(null)
    setPreviewUrl('')
    setAvatar('')
  }

  const handleSubmit = async () => {
    if (!nickName.trim()) {
      toast('提示', { description: '请填写昵称', variant: 'warning' })
      return
    }
    setSaving(true)
    try {
      let avatarUrl = avatar
      if (file) {
        const res = await uploadMyAvatar(file)
        avatarUrl = res.avatar
      }
      await updateProfileInfo({
        nickName: nickName.trim(),
        email,
        phonenumber,
        avatar: avatarUrl || '',
      })
      if (user) {
        setUserInfo(
          { ...user, nick_name: nickName.trim(), email, phonenumber, avatar: avatarUrl },
          roles,
          permissions,
        )
      }
      toast('成功', { description: '个人资料已更新', variant: 'success' })
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
      title="个人资料"
      icon={UserRound}
      size="sm"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="头像">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-lg font-medium text-muted">
            {displayAvatar ? (
              <img src={displayAvatar} alt="头像" className="size-16 rounded-full object-cover" />
            ) : (
              ((nickName.trim().slice(0, 1) || 'U').toUpperCase())
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onPress={() => fileInputRef.current?.click()}>
              <Upload size={12} className="size-3!" aria-hidden />
              上传头像
            </Button>
            {(avatar || file) && (
              <Button variant="tertiary" size="sm" onPress={handleClear}>
                清除
              </Button>
            )}
          </div>
        </div>
      </FormSection>
      <FormSection title="基础信息">
        <div className="flex flex-col gap-4">
          <TextField value={nickName} onChange={setNickName} isRequired>
            <Label>昵称</Label>
            <Input />
          </TextField>
          <TextField value={phonenumber} onChange={setPhonenumber}>
            <Label>手机号</Label>
            <Input />
          </TextField>
          <TextField value={email} onChange={setEmail}>
            <Label>邮箱</Label>
            <Input />
          </TextField>
        </div>
      </FormSection>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
    </FormModal>
  )
}
