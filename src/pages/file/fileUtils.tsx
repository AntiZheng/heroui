import type { LucideIcon } from 'lucide-react'
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react'
import { Chip, toast } from '@heroui/react'
import { FILE_CATEGORY_LABELS } from '../../types/file'
import type { FileCategory, FileVisibility } from '../../types/file'

export const CATEGORY_ICONS: Record<FileCategory, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  document: FileText,
  other: FileIcon,
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function formatTime(value?: string | null): string {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '—'
}

export function CategoryChip({ category }: { category: FileCategory }) {
  return (
    <Chip size="sm" variant="soft" color="default">
      {FILE_CATEGORY_LABELS[category]}
    </Chip>
  )
}

export function VisibilityChip({ visibility }: { visibility: FileVisibility }) {
  return (
    <Chip size="sm" variant="soft" color={visibility === 'public' ? 'success' : 'default'}>
      {visibility === 'public' ? '公开' : '私有'}
    </Chip>
  )
}

/** 复制文本到剪贴板：clipboard → execCommand 回退 → 失败 toast（http 环境降级） */
export async function copyText(text: string, description: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('成功', { description, variant: 'success' })
  } catch {
    // 非 https 环境 navigator.clipboard 可能为 undefined，回退 execCommand
    if (copyViaExecCommand(text)) {
      toast('成功', { description, variant: 'success' })
    } else {
      toast('复制失败', { description: '请手动选中复制', variant: 'danger' })
    }
  }
}

/** execCommand 已废弃，仅作为 clipboard API 不可用时的降级方案 */
function copyViaExecCommand(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    // fixed + opacity 0：避免闪现元素或导致页面滚动
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
