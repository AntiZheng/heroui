import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Radio,
  RadioContent,
  RadioControl,
  RadioGroup,
  RadioIndicator,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextField,
  Typography,
  toast,
} from '@heroui/react'
import { ArrowLeft, Megaphone } from 'lucide-react'
import RichTextEditor, { type RichTextEditorHandle } from '../../../components/editor/RichTextEditor'
import { addNotice, editNotice, getNoticeDetail } from '../../../api/notice'
import {
  NOTICE_STATUS_OPTIONS,
  NOTICE_TYPE_OPTIONS,
  type NoticePayload,
} from '../../../types/notice'

export default function NoticeEditorPage() {
  const { noticeId: noticeIdParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const parsedId = noticeIdParam ? Number(noticeIdParam) : null
  const noticeId = parsedId !== null && Number.isFinite(parsedId) ? parsedId : null
  const isEdit = noticeId !== null

  const {
    data: notice,
    isPending: detailPending,
    isError,
  } = useQuery({
    queryKey: ['notice-detail', noticeId],
    queryFn: () => getNoticeDetail(noticeId!),
    enabled: isEdit,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const [form, setForm] = useState({ noticeTitle: '', noticeType: '1', status: '0' })
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  useEffect(() => {
    if (!notice) return
    setForm({
      noticeTitle: notice.notice_title,
      noticeType: notice.notice_type,
      status: notice.status ?? '0',
    })
  }, [notice])

  const goBack = () => {
    // 直接打开编辑地址时没有可返回的站内历史，回退到列表
    if (location.key !== 'default') navigate(-1)
    else navigate('/system/notice')
  }

  const handleSubmit = async () => {
    const content = editorRef.current?.getHTML() ?? ''
    const text = editorRef.current?.getText().trim() ?? ''
    if (!form.noticeTitle.trim()) {
      toast('提示', { description: '请填写公告标题', variant: 'warning' })
      return
    }
    if (!text) {
      toast('提示', { description: '请填写公告内容', variant: 'warning' })
      return
    }
    const payload: NoticePayload = {
      noticeTitle: form.noticeTitle.trim(),
      noticeType: form.noticeType,
      noticeContent: content,
      status: form.status,
      remark: notice?.remark ?? undefined,
    }
    setSaving(true)
    try {
      if (isEdit) {
        await editNotice({ ...payload, noticeId })
        toast('成功', { description: '修改公告成功', variant: 'success' })
      } else {
        await addNotice(payload)
        toast('成功', { description: '新增公告成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['notice-list'] })
      goBack()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  const loading = isEdit && detailPending

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="tertiary"
          size="sm"
          isIconOnly
          className="rounded-full!"
          aria-label="返回通知公告"
          onPress={goBack}
        >
          <ArrowLeft size={12} className="size-3!" aria-hidden />
        </Button>
        <Typography.Heading level={6} className="text-[13px] leading-4">
          {isEdit ? '编辑公告' : '新增公告'}
        </Typography.Heading>
      </div>

      <div className="flex min-h-0 w-full flex-1">
        <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border border-separator bg-surface p-6 shadow-sm">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Megaphone size={20} aria-hidden className="text-muted" />
              <Typography.Paragraph size="sm" color="muted">
                公告不存在或加载失败
              </Typography.Paragraph>
              <Button variant="tertiary" size="sm" onPress={goBack}>
                返回列表
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <TextField
                  className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-4"
                  value={form.noticeTitle}
                  onChange={(value) => setForm((f) => ({ ...f, noticeTitle: value }))}
                  isRequired
                >
                  <Label className="text-xs font-medium text-muted">公告标题</Label>
                  <Input placeholder="请输入公告标题" maxLength={50} />
                </TextField>
                <SelectRoot
                  aria-label="公告类型"
                  className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-4"
                  selectedKey={form.noticeType}
                  onSelectionChange={(key) => {
                    if (key != null) setForm((f) => ({ ...f, noticeType: String(key) }))
                  }}
                >
                  <Label className="text-xs font-medium text-muted">公告类型</Label>
                  <SelectTrigger>
                    <SelectValue />
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
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-[80px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4">
                <span className="cursor-default self-start pt-3 text-xs font-medium text-muted select-none">
                  公告内容
                </span>
                {(!isEdit || notice) && (
                  <RichTextEditor
                    key={notice?.notice_id ?? 'new'}
                    ref={editorRef}
                    defaultValue={notice?.notice_content ?? ''}
                    placeholder="输入公告正文…"
                    showFooter={false}
                    className="min-h-0"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t border-separator/60 pt-4">
                <span className="cursor-default text-xs font-medium text-muted select-none">
                  公告状态
                </span>
                <RadioGroup
                  aria-label="公告状态"
                  orientation="horizontal"
                  value={form.status}
                  onChange={(value: string) => setForm((f) => ({ ...f, status: value }))}
                  className="flex flex-row gap-8"
                >
                  {NOTICE_STATUS_OPTIONS.map((option) => (
                    <Radio key={option.key} value={option.key}>
                      <RadioContent>
                        <RadioControl>
                          <RadioIndicator />
                        </RadioControl>
                        {option.label}
                      </RadioContent>
                    </Radio>
                  ))}
                </RadioGroup>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="tertiary" size="sm" isDisabled={saving} onPress={goBack}>
                    取消
                  </Button>
                  <Button variant="primary" size="sm" isPending={saving} onPress={handleSubmit}>
                    保存
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
