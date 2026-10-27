// 存储设置页（F6）：MinIO 连接/桶/上传策略/CORS 单页表单 + 连接测试 + 初始化桶
// 单层白卡布局；secret 不回填表单，仅在 placeholder 提示末 4 位
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
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
  Typography,
  AlertDialog,
  toast,
} from '@heroui/react'
import { CheckCircle2, DatabaseBackup, PlugZap, Save, XCircle } from 'lucide-react'
import {
  getStorageConfig,
  initStorageBuckets,
  saveStorageConfig,
  testStorage,
} from '../../api/storage'
import type { StorageCheckItem, StorageConfig, StorageConfigPayload } from '../../types/storage'
import { FormSection } from '../../components/FormSection'
import { useModalBackdropVariant } from '../../components/useModalBackdrop'
import { hasPermission } from '../../stores/auth'

/** 数值型字段：表单内以字符串承载，保存/测试前统一 Number() 化 */
const NUMERIC_FIELDS = [
  'max_file_size_mb',
  'multipart_threshold_mb',
  'part_size_mb',
  'upload_concurrency',
  'upload_session_expire_hours',
  'upload_presign_expire_minutes',
  'download_presign_expire_seconds',
] as const

type NumericField = (typeof NUMERIC_FIELDS)[number]

/** 与后端 StorageConfigUpdate 字段默认值一致：首次配置（无已存值可回退）时使用，避免传 0 触发 ge=1 校验 422 */
const NUMERIC_DEFAULTS: Record<NumericField, number> = {
  max_file_size_mb: 1024,
  multipart_threshold_mb: 20,
  part_size_mb: 10,
  upload_concurrency: 3,
  upload_session_expire_hours: 24,
  upload_presign_expire_minutes: 120,
  download_presign_expire_seconds: 900,
}

type StorageForm = {
  [K in keyof Omit<StorageConfig, 'has_secret' | 'secret_hint'>]: K extends NumericField
    ? string
    : StorageConfig[K]
}

const EMPTY_FORM: StorageForm = {
  internal_endpoint: '',
  public_endpoint: '',
  region: '',
  access_key: '',
  private_bucket: '',
  public_bucket: '',
  public_base_url: '',
  allowed_origins: '',
  allowed_extensions: '',
  default_visibility: 'private',
  max_file_size_mb: '',
  multipart_threshold_mb: '',
  part_size_mb: '',
  upload_concurrency: '',
  upload_session_expire_hours: '',
  upload_presign_expire_minutes: '',
  download_presign_expire_seconds: '',
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password' | 'number'
}) {
  return (
    <TextField value={value} onChange={onChange} aria-label={label}>
      <Label className="text-xs font-medium text-muted">{label}</Label>
      <Input type={type} placeholder={placeholder} />
    </TextField>
  )
}

function ResultRows({ items }: { items: StorageCheckItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <span
          key={`${item.key}-${i}`}
          className={`flex items-center gap-1.5 text-xs ${item.ok ? 'text-success' : 'text-danger'}`}
        >
          {item.ok ? (
            <CheckCircle2 size={12} aria-hidden className="shrink-0" />
          ) : (
            <XCircle size={12} aria-hidden className="shrink-0" />
          )}
          <span className="font-medium">{item.key}</span>
          <span className="truncate">{item.message}</span>
        </span>
      ))}
    </div>
  )
}

export default function StoragePage() {
  const queryClient = useQueryClient()
  const backdropVariant = useModalBackdropVariant()

  const [form, setForm] = useState<StorageForm>(EMPTY_FORM)
  const [secretInput, setSecretInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initOpen, setInitOpen] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [testResult, setTestResult] = useState<StorageCheckItem[]>([])
  const [initResult, setInitResult] = useState<StorageCheckItem[]>([])

  const { data } = useQuery({ queryKey: ['storage-config'], queryFn: getStorageConfig })

  // 配置回填表单（数值转字符串展示；secret 输入框保持空，不回传）
  useEffect(() => {
    if (!data) return
    setForm({
      internal_endpoint: data.internal_endpoint ?? '',
      public_endpoint: data.public_endpoint ?? '',
      region: data.region ?? '',
      access_key: data.access_key ?? '',
      private_bucket: data.private_bucket ?? '',
      public_bucket: data.public_bucket ?? '',
      public_base_url: data.public_base_url ?? '',
      allowed_origins: data.allowed_origins ?? '',
      allowed_extensions: data.allowed_extensions ?? '',
      default_visibility: data.default_visibility ?? 'private',
      max_file_size_mb: String(data.max_file_size_mb ?? ''),
      multipart_threshold_mb: String(data.multipart_threshold_mb ?? ''),
      part_size_mb: String(data.part_size_mb ?? ''),
      upload_concurrency: String(data.upload_concurrency ?? ''),
      upload_session_expire_hours: String(data.upload_session_expire_hours ?? ''),
      upload_presign_expire_minutes: String(data.upload_presign_expire_minutes ?? ''),
      download_presign_expire_seconds: String(data.download_presign_expire_seconds ?? ''),
    })
  }, [data])

  const setField = (key: keyof StorageForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  /** 保存/测试共用载荷：数值 Number() 化（空串回退已加载配置原值，永不出现 0/NaN）；secret 仅在用户输入时随载荷传出 */
  const buildPayload = (): StorageConfigPayload => {
    const numeric = Object.fromEntries(
      NUMERIC_FIELDS.map((key) => [
        key,
        Number(form[key]) || Number(data?.[key] ?? 0) || NUMERIC_DEFAULTS[key],
      ]),
    ) as Pick<StorageConfigPayload, NumericField>
    const rest: Omit<StorageConfigPayload, NumericField | 'secretKey'> = {
      internal_endpoint: form.internal_endpoint,
      public_endpoint: form.public_endpoint,
      region: form.region,
      access_key: form.access_key,
      private_bucket: form.private_bucket,
      public_bucket: form.public_bucket,
      public_base_url: form.public_base_url,
      allowed_origins: form.allowed_origins,
      allowed_extensions: form.allowed_extensions,
      default_visibility: form.default_visibility,
    }
    return { ...rest, ...numeric, secretKey: secretInput || undefined }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveStorageConfig(buildPayload())
    } catch {
      setSaving(false)
      return
    }
    setSaving(false)
    setSecretInput('')
    toast('成功', { description: '存储配置已保存', variant: 'success' })
    queryClient.invalidateQueries({ queryKey: ['storage-config'] })
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const res = await testStorage(buildPayload())
      setTestResult(res)
      const allOk = res.length > 0 && res.every((item) => item.ok)
      if (allOk) {
        toast('测试完成', { description: '全部检查项通过', variant: 'success' })
      } else {
        toast('测试完成', {
          description: `${res.filter((item) => !item.ok).length} 项未通过，详见下方结果`,
          variant: 'warning',
        })
      }
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setTesting(false)
    }
  }

  const handleInit = async () => {
    setInitOpen(false)
    setInitializing(true)
    try {
      const res = await initStorageBuckets()
      setInitResult(res)
      toast('成功', { description: '初始化完成', variant: 'success' })
    } catch {
      setInitializing(false)
      return
    }
    setInitializing(false)
  }

  const secretPlaceholder = data?.has_secret
    ? `已配置（末 4 位 ${data.secret_hint}），留空不修改`
    : '请输入 MinIO Secret Key'

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full max-w-3xl flex-col gap-6 rounded-2xl border border-separator bg-surface p-6 shadow-sm">
          {/* 标题行 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Typography.Heading level={6} className="text-[13px] leading-4">
              存储设置
            </Typography.Heading>
            {hasPermission('file:config') && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" isDisabled={testing} onPress={handleTest}>
                  <PlugZap size={12} className="size-3!" aria-hidden />
                  测试连接
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={initializing}
                  onPress={() => setInitOpen(true)}
                >
                  <DatabaseBackup size={12} className="size-3!" aria-hidden />
                  初始化桶
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={saving}
                  onPress={handleSave}
                  className="bg-accent-soft! text-accent-soft-foreground! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!"
                >
                  <Save size={12} className="size-3!" aria-hidden />
                  保存
                </Button>
              </div>
            )}
          </div>

          <FormSection title="连接信息" tone="accent">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="内部端点"
                  value={form.internal_endpoint}
                  onChange={(v) => setField('internal_endpoint', v)}
                  placeholder="如 http://127.0.0.1:9000"
                />
                <Field
                  label="公开端点"
                  value={form.public_endpoint}
                  onChange={(v) => setField('public_endpoint', v)}
                  placeholder="如 https://oss.example.com"
                />
                <Field
                  label="Region"
                  value={form.region}
                  onChange={(v) => setField('region', v)}
                  placeholder="如 us-east-1"
                />
                <Field
                  label="Access Key"
                  value={form.access_key}
                  onChange={(v) => setField('access_key', v)}
                />
              </div>
              <Field
                label="Secret Key"
                type="password"
                value={secretInput}
                onChange={setSecretInput}
                placeholder={secretPlaceholder}
              />
            </div>
          </FormSection>

          <FormSection title="桶配置" tone="accent">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="私有桶"
                  value={form.private_bucket}
                  onChange={(v) => setField('private_bucket', v)}
                />
                <Field
                  label="公开桶"
                  value={form.public_bucket}
                  onChange={(v) => setField('public_bucket', v)}
                />
              </div>
              <Field
                label="公开基础地址"
                value={form.public_base_url}
                onChange={(v) => setField('public_base_url', v)}
                placeholder="可选，留空使用公开端点/公开桶"
              />
            </div>
          </FormSection>

          <FormSection title="上传策略" tone="success">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="单文件上限（MB）"
                  type="number"
                  value={form.max_file_size_mb}
                  onChange={(v) => setField('max_file_size_mb', v)}
                  placeholder={`当前 ${data?.max_file_size_mb ?? '—'}`}
                />
                <Field
                  label="分片阈值（MB）"
                  type="number"
                  value={form.multipart_threshold_mb}
                  onChange={(v) => setField('multipart_threshold_mb', v)}
                  placeholder={`当前 ${data?.multipart_threshold_mb ?? '—'}`}
                />
                <Field
                  label="分片大小（MB）"
                  type="number"
                  value={form.part_size_mb}
                  onChange={(v) => setField('part_size_mb', v)}
                  placeholder={`当前 ${data?.part_size_mb ?? '—'}`}
                />
                <Field
                  label="并发数"
                  type="number"
                  value={form.upload_concurrency}
                  onChange={(v) => setField('upload_concurrency', v)}
                  placeholder={`当前 ${data?.upload_concurrency ?? '—'}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectRoot
                  aria-label="默认可见性"
                  selectedKey={form.default_visibility}
                  onSelectionChange={(key) => {
                    if (key != null) setField('default_visibility', String(key))
                  }}
                >
                  <Label className="text-xs font-medium text-muted">默认可见性</Label>
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIndicator />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      <ListBoxItem id="private">私有</ListBoxItem>
                      <ListBoxItem id="public">公开</ListBoxItem>
                    </ListBox>
                  </SelectPopover>
                </SelectRoot>
                <Field
                  label="允许后缀"
                  value={form.allowed_extensions}
                  onChange={(v) => setField('allowed_extensions', v)}
                  placeholder="逗号分隔，如 pdf,docx；留空不限制"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="访问与 CORS" tone="warning">
            <div className="flex flex-col gap-4">
              <Field
                label="CORS 允许来源"
                value={form.allowed_origins}
                onChange={(v) => setField('allowed_origins', v)}
                placeholder="逗号分隔，生产环境追加正式域名"
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="下载签名有效期（秒）"
                  type="number"
                  value={form.download_presign_expire_seconds}
                  onChange={(v) => setField('download_presign_expire_seconds', v)}
                  placeholder={`当前 ${data?.download_presign_expire_seconds ?? '—'}`}
                />
                <Field
                  label="上传会话有效期（小时）"
                  type="number"
                  value={form.upload_session_expire_hours}
                  onChange={(v) => setField('upload_session_expire_hours', v)}
                  placeholder={`当前 ${data?.upload_session_expire_hours ?? '—'}`}
                />
                <Field
                  label="上传签名有效期（分钟）"
                  type="number"
                  value={form.upload_presign_expire_minutes}
                  onChange={(v) => setField('upload_presign_expire_minutes', v)}
                  placeholder={`当前 ${data?.upload_presign_expire_minutes ?? '—'}`}
                />
              </div>
            </div>
          </FormSection>

          {/* 结果展示区 */}
          {(testResult.length > 0 || initResult.length > 0) && (
            <div className="flex flex-col gap-4 border-t border-separator pt-4">
              {testResult.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-foreground">连接测试结果</span>
                  <ResultRows items={testResult} />
                </div>
              )}
              {initResult.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-foreground">初始化结果</span>
                  <ResultRows items={initResult} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 初始化桶确认 */}
      <AlertDialog
        isOpen={initOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setInitOpen(false)
        }}
      >
        <AlertDialog.Backdrop variant={backdropVariant}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>初始化存储桶？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>将创建私有/公开两个桶并写入匿名只读策略与 CORS，同名桶已存在时跳过创建。确定继续吗？</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" size="sm" variant="tertiary">
                  取消
                </Button>
                <Button slot="close" size="sm" variant="primary" onPress={handleInit}>
                  初始化
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
