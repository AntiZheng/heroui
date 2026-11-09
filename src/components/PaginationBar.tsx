import { useState } from 'react'
import {
  Input,
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
} from '@heroui/react'
import PageSizeStepper from './PageSizeStepper'

/** 页码窗口：当前页前后各一页，超出 7 页用省略号折叠 */
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

interface PaginationBarProps {
  /** 记录总数 */
  total: number
  /** 当前页码（从 1 起） */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 页码或每页条数变化回调（翻页时由父组件重置 pageNum=1） */
  onChange: (patch: { pageNum?: number; pageSize?: number }) => void
}

/** 列表页统一分页栏：摘要 + 每页条数 + 页码窗口 + 上一页/下一页 + 跳页 */
export default function PaginationBar({ total, pageNum, pageSize, onChange }: PaginationBarProps) {
  const [jumpTo, setJumpTo] = useState('')
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const jump = () => {
    const p = Math.min(Math.max(Number(jumpTo) || 1, 1), totalPages)
    onChange({ pageNum: p })
    setJumpTo('')
  }

  return (
    <PaginationRoot size="sm">
      <PaginationSummary>
        {total
          ? `第 ${(pageNum - 1) * pageSize + 1} 至 ${Math.min(pageNum * pageSize, total)} 条，共 ${total} 条`
          : '共 0 条'}
        <PageSizeStepper
          pageSize={pageSize}
          onChange={(n) => onChange({ pageNum: 1, pageSize: n })}
        />
      </PaginationSummary>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            isDisabled={pageNum <= 1}
            onPress={() => onChange({ pageNum: pageNum - 1 })}
          >
            <PaginationPreviousIcon aria-hidden />
            上一页
          </PaginationPrevious>
        </PaginationItem>
        {pageWindow(totalPages, pageNum).map((p, i) =>
          p === '…' ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink isActive={p === pageNum} onPress={() => onChange({ pageNum: p })}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            isDisabled={pageNum >= totalPages}
            onPress={() => onChange({ pageNum: pageNum + 1 })}
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
  )
}
